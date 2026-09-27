use std::{
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use tokio::{process::Child, time::sleep};

#[path = "sidecar_install.rs"]
mod sidecar_install;

const HEALTH_URL: &str = "http://127.0.0.1:8000/health";
const BACKEND_EXECUTABLE: &str = if cfg!(windows) {
    "chaotang-backend.exe"
} else {
    "chaotang-backend"
};

pub async fn ensure_started(
    resource_dir: Option<PathBuf>,
    app_data_dir: Option<PathBuf>,
) -> Result<Option<Child>, String> {
    if backend_is_healthy().await {
        if let (Some(resource_dir), Some(app_data_dir)) = (&resource_dir, &app_data_dir) {
            if let Some(source) = bundled_backend(resource_dir) {
                let installed = app_data_dir.join("chaotang-backend-v0.1.5");
                let matches = tokio::task::spawn_blocking(move || {
                    sidecar_install::matches_bundle(&source, &installed)
                })
                .await
                .map_err(|error| format!("无法核对正在运行的后端：{error}"))?
                .map_err(|error| format!("无法核对正在运行的后端文件：{error}"))?;
                if !matches {
                    return Err("当前有其他或旧版朝堂后端正在运行。请先退出旧版朝堂，再启动本版本；未改动账户和成果数据。".into());
                }
            }
        }
        tracing::info!("Chaotang backend is already running");
        return Ok(None);
    }

    let launch = backend_launch(resource_dir, app_data_dir).await?;

    let mut command = tokio::process::Command::new(&launch.executable);
    command.current_dir(&launch.working_dir);
    for argument in launch.arguments {
        command.arg(argument);
    }
    // Account/setup endpoints must remain available before model configuration.
    // Model requests still enforce their own provider credential requirements.
    if let Some(api_key) = deepseek_api_key() {
        command.env("DEEPSEEK_API_KEY", api_key);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动朝堂后端：{error}"))?;

    // A frozen Python sidecar performs one-time loader initialization on its
    // first launch, which can take noticeably longer than the source venv.
    for _ in 0..480 {
        if backend_is_healthy().await {
            tracing::info!("Chaotang backend started automatically");
            return Ok(Some(child));
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("朝堂后端提前退出：{status}"));
        }
        sleep(Duration::from_millis(250)).await;
    }

    let _ = child.kill().await;
    Err("朝堂后端启动超时".to_string())
}

struct BackendLaunch {
    executable: PathBuf,
    working_dir: PathBuf,
    arguments: Vec<String>,
}

fn bundled_backend(resource_dir: &Path) -> Option<PathBuf> {
    [
        resource_dir.join("resources/chaotang-backend"),
        resource_dir.join("chaotang-backend"),
    ]
    .into_iter()
    .find(|path| path.join(BACKEND_EXECUTABLE).is_file())
}

async fn backend_launch(
    resource_dir: Option<PathBuf>,
    app_data_dir: Option<PathBuf>,
) -> Result<BackendLaunch, String> {
    if let (Some(resource_dir), Some(app_data_dir)) = (resource_dir, app_data_dir) {
        let bundled = bundled_backend(&resource_dir);

        if let Some(source) = bundled {
            let destination = app_data_dir.join("chaotang-backend-v0.1.5");
            let executable = destination.join(BACKEND_EXECUTABLE);
            let destination_for_copy = destination.clone();
            tokio::task::spawn_blocking(move || {
                sidecar_install::prepare(&source, &destination_for_copy, BACKEND_EXECUTABLE)
            })
            .await
            .map_err(|error| format!("朝堂 sidecar 解包任务失败：{error}"))?
            .map_err(|error| format!("无法准备朝堂 sidecar（原数据已保留）：{error}"))?;
            fs::create_dir_all(destination.join("_internal/data/report_artifacts"))
                .map_err(|error| format!("无法准备朝堂成果目录：{error}"))?;
            return Ok(BackendLaunch {
                executable,
                working_dir: destination,
                arguments: Vec::new(),
            });
        }
    }

    let backend_dir = backend_dir()?;
    let python = if cfg!(windows) {
        backend_dir.join(".venv/Scripts/python.exe")
    } else {
        backend_dir.join(".venv/bin/python")
    };
    if !python.is_file() {
        return Err(format!(
            "朝堂后端运行环境不存在：{}；请先安装 backend 依赖",
            python.display()
        ));
    }
    Ok(BackendLaunch {
        executable: python,
        working_dir: backend_dir,
        arguments: vec![
            "-m".into(),
            "uvicorn".into(),
            "app.main:app".into(),
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            "8000".into(),
        ],
    })
}

async fn backend_is_healthy() -> bool {
    let Ok(client) = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(400))
        .timeout(Duration::from_secs(1))
        .build()
    else {
        return false;
    };
    let Ok(response) = client.get(HEALTH_URL).send().await else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    response
        .json::<serde_json::Value>()
        .await
        .ok()
        .is_some_and(|body| {
            body.get("status").and_then(|value| value.as_str()) == Some("ok")
                && body.get("service").and_then(|value| value.as_str())
                    == Some("chaotang-os-backend")
        })
}

fn backend_dir() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("CHAOTANG_BACKEND_DIR") {
        let path = PathBuf::from(path);
        if path.join("app/main.py").is_file() {
            return Ok(path);
        }
        return Err("CHAOTANG_BACKEND_DIR 未指向有效的朝堂 backend 目录".to_string());
    }

    let development_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../chaotang-os/backend");
    if development_path.join("app/main.py").is_file() {
        return Ok(development_path);
    }

    Err("未找到朝堂 backend；请通过 CHAOTANG_BACKEND_DIR 指定目录".to_string())
}

fn deepseek_api_key() -> Option<String> {
    std::env::var("DEEPSEEK_API_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(keychain_deepseek_api_key)
}

#[cfg(target_os = "macos")]
fn keychain_deepseek_api_key() -> Option<String> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", "ai.cdesktop.deepseek", "-w"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(not(target_os = "macos"))]
fn keychain_deepseek_api_key() -> Option<String> {
    None
}
