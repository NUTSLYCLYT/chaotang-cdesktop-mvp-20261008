//! Validate an isolated candidate before config, credentials, or databases are read.
use std::{ffi::OsStr, path::Path};

fn directory_key(path: &Path) -> String {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| {
        let mut normalized = std::path::PathBuf::new();
        for component in path.components() {
            match component {
                std::path::Component::CurDir => {}
                std::path::Component::ParentDir => {
                    normalized.pop();
                }
                other => normalized.push(other.as_os_str()),
            }
        }
        normalized
    });
    let key = resolved.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        if let Some(rest) = key.strip_prefix("\\\\?\\UNC\\") {
            format!("\\\\{rest}").to_lowercase()
        } else {
            key.strip_prefix("\\\\?\\").unwrap_or(&key).to_lowercase()
        }
    }
    #[cfg(not(windows))]
    {
        key
    }
}

pub fn reject(message: &str) -> ! {
    eprintln!("{message}");
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW};
        let title: Vec<u16> = "朝堂融合候选未启动\0".encode_utf16().collect();
        let body: Vec<u16> = format!("请通过 Start-Fusion.cmd 启动本候选。\n隔离配置缺失或无效，未打开应用数据。\n\n{message}\0")
            .encode_utf16().collect();
        // Both buffers are NUL-terminated and remain alive for the synchronous dialog.
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                body.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
    std::process::exit(2)
}

pub fn validate(
    required: bool,
    external_flag: Option<&str>,
    data_dir: Option<&OsStr>,
    webview_dir: Option<&OsStr>,
) -> Result<(), &'static str> {
    if !required {
        return Ok(());
    }
    if external_flag != Some("1") {
        return Err(
            "Fusion candidate requires its Start-Fusion launcher and external backend configuration",
        );
    }
    for (value, message) in [
        (
            data_dir,
            "Fusion candidate requires an absolute isolated CDESKTOP_DATA_DIR",
        ),
        (
            webview_dir,
            "Fusion candidate requires an absolute isolated CDESKTOP_WEBVIEW_DATA_DIR",
        ),
    ] {
        let value = value.ok_or(message)?;
        if value.is_empty() || !Path::new(value).is_absolute() {
            return Err(message);
        }
        if Path::new(value).exists() && !Path::new(value).is_dir() {
            return Err(message);
        }
    }
    if directory_key(Path::new(data_dir.expect("validated data directory")))
        == directory_key(Path::new(webview_dir.expect("validated browser directory")))
    {
        return Err("Fusion candidate requires separate desktop and browser data directories");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_cannot_fall_back_to_original_defaults() {
        assert!(validate(true, None, None, None).is_err());
        assert!(validate(true, Some("0"), None, None).is_err());
        assert!(validate(true, Some("1"), None, None).is_err());
        assert!(validate(true, Some("1"), Some(OsStr::new("relative")), None).is_err());
        assert!(validate(false, None, None, None).is_ok());
    }

    #[test]
    fn isolated_paths_are_required_without_creating_them() {
        let desktop = std::env::temp_dir().join("fusion-startup-test-data");
        let browser = std::env::temp_dir().join("fusion-startup-test-browser");
        assert!(
            validate(
                true,
                Some("1"),
                Some(desktop.as_os_str()),
                Some(browser.as_os_str())
            )
            .is_ok()
        );
        assert!(
            validate(
                true,
                Some("1"),
                Some(desktop.as_os_str()),
                Some(desktop.as_os_str())
            )
            .is_err()
        );
        assert!(
            validate(
                true,
                Some("1"),
                Some(OsStr::new("")),
                Some(browser.as_os_str())
            )
            .is_err()
        );
    }

    #[test]
    fn directory_aliases_cannot_bypass_separate_profiles() {
        let data = std::env::temp_dir().join("fusion-startup-alias-test");
        let alias = data.join("nested").join("..");
        assert!(
            validate(
                true,
                Some("1"),
                Some(data.as_os_str()),
                Some(alias.as_os_str())
            )
            .is_err()
        );
        let dot = data.join(".");
        assert!(
            validate(
                true,
                Some("1"),
                Some(data.as_os_str()),
                Some(dot.as_os_str())
            )
            .is_err()
        );
        #[cfg(windows)]
        {
            let upper = data.to_string_lossy().to_uppercase();
            assert!(
                validate(
                    true,
                    Some("1"),
                    Some(data.as_os_str()),
                    Some(OsStr::new(&upper))
                )
                .is_err()
            );
        }
    }
}
