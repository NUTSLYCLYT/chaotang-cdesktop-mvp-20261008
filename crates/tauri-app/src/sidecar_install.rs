//! Prepare backend code without discarding local accounts, artifacts or credentials.
//! Installation copies are staged and checked before the old directory is renamed.
//! Old and incomplete directories are retained; database schema migration belongs
//! to the backend, not this desktop transport layer.

use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

// All current backend stores and MCP credentials are below data. Configuration
// is local user state too. Unknown older files remain in the full rollback copy.
const USER_DIRECTORIES: [&str; 4] = ["data", "_internal/data", "config", "_internal/config"];

fn error(message: &str) -> io::Error {
    io::Error::other(message)
}

fn is_user_path(relative: &Path) -> bool {
    USER_DIRECTORIES
        .iter()
        .any(|root| relative.starts_with(root))
        || relative.file_name().is_some_and(|name| {
            let name = name.to_string_lossy();
            name == ".env" || name.starts_with(".env.")
        })
}

fn hash(path: &Path) -> io::Result<String> {
    let mut reader = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn safe_metadata(path: &Path) -> io::Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Err(error("安装目录含链接，需先人工核对；未删除任何文件"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Reject junctions and all other reparse points as well as symlinks.
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(error("安装目录含重解析点，需先人工核对"));
        }
    }
    Ok(metadata)
}

fn inventory(root: &Path) -> io::Result<BTreeMap<PathBuf, String>> {
    fn visit(root: &Path, at: &Path, result: &mut BTreeMap<PathBuf, String>) -> io::Result<()> {
        let metadata = safe_metadata(at)?;
        if metadata.is_dir() {
            for item in fs::read_dir(at)? {
                visit(root, &item?.path(), result)?;
            }
        } else if metadata.is_file() {
            result.insert(
                at.strip_prefix(root).map_err(|_| error("路径越界"))?.into(),
                hash(at)?,
            );
        } else {
            return Err(error("安装目录包含非常规文件"));
        }
        Ok(())
    }
    let mut result = BTreeMap::new();
    visit(root, root, &mut result)?;
    Ok(result)
}

fn copy_tree(source: &Path, destination: &Path) -> io::Result<()> {
    let metadata = safe_metadata(source)?;
    if metadata.is_dir() {
        if destination.exists() {
            if !safe_metadata(destination)?.is_dir() {
                return Err(error("目录与文件冲突"));
            }
        } else {
            fs::create_dir(destination)?;
        }
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_tree(&entry.path(), &destination.join(entry.file_name()))?;
        }
    } else if metadata.is_file() {
        if destination.exists() {
            safe_metadata(destination)?;
        }
        fs::copy(source, destination)?;
    } else {
        return Err(error("不能复制非常规文件"));
    }
    Ok(())
}

fn code_inventory(files: &BTreeMap<PathBuf, String>) -> BTreeMap<PathBuf, String> {
    files
        .iter()
        .filter(|(path, _)| !is_user_path(path))
        .map(|(p, h)| (p.clone(), h.clone()))
        .collect()
}

pub(super) fn matches_bundle(source: &Path, installed: &Path) -> io::Result<bool> {
    if !installed.exists() {
        return Ok(false);
    }
    if installed.parent().is_some_and(|parent| {
        parent
            .join("chaotang-backend-install-pending.json")
            .exists()
    }) {
        return Err(error("存在未完成的后端切换记录；请先恢复"));
    }
    Ok(compatible_files(
        &inventory(source)?,
        &inventory(installed)?,
    ))
}

fn compatible_files(
    expected: &BTreeMap<PathBuf, String>,
    installed: &BTreeMap<PathBuf, String>,
) -> bool {
    code_inventory(expected) == code_inventory(installed)
        && expected.keys().all(|path| installed.contains_key(path))
}

struct InstallLock(PathBuf);
impl Drop for InstallLock {
    fn drop(&mut self) {
        // Remove only this invocation's lock; never recursively clean any data.
        let _ = fs::remove_file(&self.0);
    }
}

pub(super) fn prepare(source: &Path, destination: &Path, executable: &str) -> io::Result<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| error("缺少安装父目录"))?;
    fs::create_dir_all(parent)?;
    safe_metadata(parent)?;
    let lock_path = parent.join(".chaotang-backend-install.lock");
    let mut lock = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|_| error("后端安装锁已存在；另一安装可能未完成，请核对后重试"))?;
    let _lock_guard = InstallLock(lock_path);
    writeln!(lock, "{}", std::process::id())?;
    lock.sync_all()?;
    drop(lock);

    let journal = parent.join("chaotang-backend-install-pending.json");
    if journal.exists() {
        return Err(error("存在未完成的后端切换记录；请先恢复，未改动旧目录"));
    }

    let expected = inventory(source)?;
    if !expected.contains_key(Path::new(executable)) {
        return Err(error("安装包缺少后端程序"));
    }
    if expected
        .keys()
        .any(|path| path.starts_with("data") || path.starts_with("_internal/data"))
    {
        return Err(error("安装包包含运行数据，拒绝覆盖本机账户"));
    }
    let previous = if destination.exists() {
        Some(inventory(destination)?)
    } else {
        None
    };
    if previous
        .as_ref()
        .is_some_and(|files| compatible_files(&expected, files))
    {
        return Ok(());
    }

    let transaction = uuid::Uuid::new_v4();
    let stage = parent.join(format!("chaotang-backend-stage-{transaction}"));
    let backup = parent.join(format!("chaotang-backend-backup-{transaction}"));
    copy_tree(source, &stage)?;
    if inventory(&stage)? != expected {
        return Err(error("新后端暂存校验失败；旧版保持不变"));
    }
    if let Some(previous) = &previous {
        // Copy only the explicitly observed runtime state roots; retain every
        // original file in the rollback directory, including unknown legacy files.
        for relative in USER_DIRECTORIES {
            let old = destination.join(relative);
            if old.exists() {
                let new = stage.join(relative);
                if let Some(parent) = new.parent() {
                    fs::create_dir_all(parent)?;
                }
                copy_tree(&old, &new)?;
            }
        }
        for relative in previous.keys().filter(|p| {
            p.file_name().is_some_and(|n| {
                let n = n.to_string_lossy();
                n == ".env" || n.starts_with(".env.")
            })
        }) {
            let target = stage.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            copy_tree(&destination.join(relative), &target)?;
        }
        let staged = inventory(&stage)?;
        for (path, hash) in previous.iter().filter(|(path, _)| is_user_path(path)) {
            if staged.get(path) != Some(hash) {
                return Err(error("运行数据复制校验失败；未切换版本"));
            }
        }
        if inventory(destination)? != *previous {
            return Err(error("复制期间旧目录仍在变化；请先退出旧版再重试"));
        }
    }
    if code_inventory(&inventory(&stage)?) != code_inventory(&expected) {
        return Err(error("新后端程序完整性校验失败"));
    }
    // Keep a readable recovery record before the first rename. A crash never
    // destroys the old tree; interrupted transactions require explicit recovery.
    let mut record = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&journal)
        .map_err(|_| error("存在未完成的后端切换记录；请先恢复，未改动旧目录"))?;
    serde_json::to_writer_pretty(
        &mut record,
        &serde_json::json!({
            "destination": destination, "stage": stage, "backup": backup,
            "hadPrevious": previous.is_some(), "state": "prepared"
        }),
    )?;
    record.sync_all()?;
    drop(record);
    if previous.is_some() {
        if let Err(cause) = fs::rename(destination, &backup) {
            fs::remove_file(&journal)?;
            return Err(cause);
        }
    }
    if let Err(cause) = fs::rename(&stage, destination) {
        if previous.is_some() {
            fs::rename(&backup, destination)?;
        }
        fs::remove_file(&journal)?;
        return Err(cause);
    }
    fs::remove_file(journal)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("ct-sidecar-test-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn file(&self, relative: &str, bytes: &[u8]) {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn upgrade_keeps_accounts_artifacts_config_and_full_rollback() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"new");
        root.file("bundle/_internal/config/providers.yaml", b"default");
        root.file("installed/backend.exe", b"old");
        root.file(
            "installed/_internal/data/shiguan.sqlite3",
            b"fixture-account-bytes",
        );
        root.file(
            "installed/_internal/data/report_artifacts/a.txt",
            b"user artifact",
        );
        root.file("installed/_internal/config/providers.yaml", b"user config");
        root.file("installed/legacy-note.txt", b"unknown legacy file");
        let old = inventory(&root.0.join("installed")).unwrap();
        prepare(
            &root.0.join("bundle"),
            &root.0.join("installed"),
            "backend.exe",
        )
        .unwrap();
        assert_eq!(
            fs::read(root.0.join("installed/backend.exe")).unwrap(),
            b"new"
        );
        assert_eq!(
            fs::read(root.0.join("installed/_internal/data/shiguan.sqlite3")).unwrap(),
            b"fixture-account-bytes"
        );
        assert_eq!(
            fs::read(root.0.join("installed/_internal/config/providers.yaml")).unwrap(),
            b"user config"
        );
        let backup = fs::read_dir(&root.0)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("chaotang-backend-backup-")
            })
            .unwrap();
        assert_eq!(inventory(&backup).unwrap(), old);
        let before = inventory(&root.0.join("installed")).unwrap();
        prepare(
            &root.0.join("bundle"),
            &root.0.join("installed"),
            "backend.exe",
        )
        .unwrap();
        assert_eq!(inventory(&root.0.join("installed")).unwrap(), before);
    }

    #[test]
    fn missing_executable_repair_keeps_existing_data() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"valid");
        root.file("installed/_internal/data/shiguan.sqlite3", b"keep");
        prepare(
            &root.0.join("bundle"),
            &root.0.join("installed"),
            "backend.exe",
        )
        .unwrap();
        assert_eq!(
            fs::read(root.0.join("installed/_internal/data/shiguan.sqlite3")).unwrap(),
            b"keep"
        );
    }

    #[test]
    fn corrupt_dependency_is_repaired_even_when_executable_matches() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"same");
        root.file("bundle/_internal/library.dll", b"correct");
        root.file("installed/backend.exe", b"same");
        root.file("installed/_internal/library.dll", b"corrupt");
        assert!(!matches_bundle(&root.0.join("bundle"), &root.0.join("installed")).unwrap());
        prepare(
            &root.0.join("bundle"),
            &root.0.join("installed"),
            "backend.exe",
        )
        .unwrap();
        assert_eq!(
            fs::read(root.0.join("installed/_internal/library.dll")).unwrap(),
            b"correct"
        );
        assert!(matches_bundle(&root.0.join("bundle"), &root.0.join("installed")).unwrap());
    }

    #[test]
    fn missing_packaged_config_is_restored_without_overwriting_preferences() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"same");
        root.file("bundle/_internal/config/providers.yaml", b"default");
        root.file(
            "bundle/_internal/config/jinyiwei_mcp.yaml",
            b"new required file",
        );
        root.file("installed/backend.exe", b"same");
        root.file("installed/_internal/config/providers.yaml", b"user config");
        assert!(!matches_bundle(&root.0.join("bundle"), &root.0.join("installed")).unwrap());
        prepare(
            &root.0.join("bundle"),
            &root.0.join("installed"),
            "backend.exe",
        )
        .unwrap();
        assert_eq!(
            fs::read(root.0.join("installed/_internal/config/providers.yaml")).unwrap(),
            b"user config"
        );
        assert_eq!(
            fs::read(root.0.join("installed/_internal/config/jinyiwei_mcp.yaml")).unwrap(),
            b"new required file"
        );
        assert!(matches_bundle(&root.0.join("bundle"), &root.0.join("installed")).unwrap());
    }

    #[test]
    fn packaged_database_is_rejected_without_changing_installed_files() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"new");
        root.file("bundle/_internal/data/users.sqlite3", b"must not ship");
        root.file("installed/backend.exe", b"old");
        let old = inventory(&root.0.join("installed")).unwrap();
        assert!(
            prepare(
                &root.0.join("bundle"),
                &root.0.join("installed"),
                "backend.exe"
            )
            .is_err()
        );
        assert_eq!(inventory(&root.0.join("installed")).unwrap(), old);
    }

    #[test]
    fn pending_transaction_and_active_lock_are_not_overwritten() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"new");
        root.file("installed/backend.exe", b"old");
        root.file(".chaotang-backend-install.lock", b"other process");
        assert!(
            prepare(
                &root.0.join("bundle"),
                &root.0.join("installed"),
                "backend.exe"
            )
            .is_err()
        );
        assert_eq!(
            fs::read(root.0.join(".chaotang-backend-install.lock")).unwrap(),
            b"other process"
        );
        fs::remove_file(root.0.join(".chaotang-backend-install.lock")).unwrap();
        root.file(
            "chaotang-backend-install-pending.json",
            b"previous transaction",
        );
        assert!(
            prepare(
                &root.0.join("bundle"),
                &root.0.join("installed"),
                "backend.exe"
            )
            .is_err()
        );
        assert_eq!(
            fs::read(root.0.join("installed/backend.exe")).unwrap(),
            b"old"
        );
        assert_eq!(
            fs::read(root.0.join("chaotang-backend-install-pending.json")).unwrap(),
            b"previous transaction"
        );
    }

    #[test]
    fn copy_conflict_keeps_the_complete_old_tree() {
        let root = Fixture::new();
        root.file("bundle/backend.exe", b"new");
        root.file("bundle/_internal/config", b"conflicting file");
        root.file("installed/backend.exe", b"old");
        root.file("installed/_internal/config/providers.yaml", b"keep");
        let old = inventory(&root.0.join("installed")).unwrap();
        assert!(
            prepare(
                &root.0.join("bundle"),
                &root.0.join("installed"),
                "backend.exe"
            )
            .is_err()
        );
        assert_eq!(inventory(&root.0.join("installed")).unwrap(), old);
    }

    #[test]
    #[ignore = "Requires an isolated real frozen-backend fixture from the HTTP integration driver"]
    fn real_packaged_backend_repair_fixture() {
        let root = PathBuf::from(
            std::env::var_os("CHAOTANG_SIDECAR_REPAIR_FIXTURE").expect("fixture required"),
        );
        assert!(
            root.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("ct-sidecar-integration-")
        );
        assert_eq!(
            fs::read(root.join("fixture-marker")).unwrap(),
            b"disposable-native-sidecar-repair"
        );
        let source = root.join("bundle");
        let installed = root.join("installed");
        let original = inventory(&installed).unwrap();
        assert!(original.contains_key(Path::new("_internal/data/shiguan.sqlite3")));
        assert!(!installed.join(super::super::BACKEND_EXECUTABLE).exists());
        prepare(&source, &installed, super::super::BACKEND_EXECUTABLE).unwrap();
        assert_eq!(
            code_inventory(&inventory(&installed).unwrap()),
            code_inventory(&inventory(&source).unwrap())
        );
        for (path, digest) in original.iter().filter(|(path, _)| is_user_path(path)) {
            assert_eq!(&hash(&installed.join(path)).unwrap(), digest);
        }
        fs::write(root.join("rust-repair-passed"), b"verified").unwrap();
    }
}
