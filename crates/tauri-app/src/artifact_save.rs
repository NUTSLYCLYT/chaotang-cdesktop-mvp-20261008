//! Restricted native artifact output. No path is accepted from the webview.
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
}

impl SaveResult {
    pub fn cancelled() -> Self {
        Self {
            status: "cancelled",
            path: None,
            sha256: None,
            bytes: None,
        }
    }
}

pub fn verify_bytes(bytes: &[u8], expected: &str) -> Result<String, String> {
    if expected.len() != 64 || !expected.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("成果缺少有效的服务端 SHA-256，无法安全保存".into());
    }
    if bytes.is_empty() || bytes.len() > 32 * 1024 * 1024 {
        return Err("成果为空或超过 32 MB 保存限制".into());
    }
    let actual = format!("{:x}", Sha256::digest(bytes));
    if !actual.eq_ignore_ascii_case(expected) {
        return Err("成果 SHA-256 校验失败，文件未保存".into());
    }
    Ok(actual)
}

pub fn safe_filename(name: &str) -> Result<&str, String> {
    let base = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let port_suffix = base
        .strip_prefix("COM")
        .or_else(|| base.strip_prefix("LPT"));
    let reserved = matches!(
        base.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || matches!(
        port_suffix,
        Some("1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")
    );
    if name.is_empty()
        || name.encode_utf16().count() > 240
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || reserved
    {
        return Err("成果文件名无效，无法打开保存窗口".into());
    }
    Ok(name)
}

#[cfg(target_os = "windows")]
pub fn choose_destination(owner: isize, name: &str) -> Result<Option<PathBuf>, String> {
    use std::os::windows::ffi::OsStringExt;

    use windows_sys::Win32::UI::Controls::Dialogs::*;
    let name = safe_filename(name)?;
    let mut buffer = vec![0u16; 32768];
    let encoded: Vec<_> = name.encode_utf16().collect();
    buffer[..encoded.len()].copy_from_slice(&encoded);
    let title: Vec<_> = "保存朝堂成果\0".encode_utf16().collect();
    let filter: Vec<_> = "所有文件\0*.*\0\0".encode_utf16().collect();
    let mut options = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        hwndOwner: owner as _,
        lpstrFile: buffer.as_mut_ptr(),
        nMaxFile: buffer.len() as u32,
        lpstrTitle: title.as_ptr(),
        lpstrFilter: filter.as_ptr(),
        Flags: OFN_EXPLORER
            | OFN_PATHMUSTEXIST
            | OFN_OVERWRITEPROMPT
            | OFN_NOCHANGEDIR
            | OFN_DONTADDTORECENT
            | OFN_NOREADONLYRETURN,
        ..Default::default()
    };
    // Buffers remain live and writable for the synchronous native dialog.
    if unsafe { GetSaveFileNameW(&mut options) } == 0 {
        return if unsafe { CommDlgExtendedError() } == 0 {
            Ok(None)
        } else {
            Err("无法打开原生保存窗口".into())
        };
    }
    let end = buffer.iter().position(|c| *c == 0).ok_or("保存路径无效")?;
    let path = PathBuf::from(std::ffi::OsString::from_wide(&buffer[..end]));
    if !path.is_absolute() {
        return Err("保存路径必须是绝对路径".into());
    }
    Ok(Some(path))
}

#[cfg(not(target_os = "windows"))]
pub fn choose_destination(_owner: isize, _name: &str) -> Result<Option<PathBuf>, String> {
    Err("此版本的原生保存仅支持 Windows".into())
}

fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;

        use windows_sys::Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        };
        let source: Vec<_> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let destination: Vec<_> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        if unsafe {
            MoveFileExW(
                source.as_ptr(),
                destination.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    std::fs::rename(source, destination)
}

pub fn atomic_save(destination: &Path, bytes: &[u8], expected: &str) -> Result<SaveResult, String> {
    let hash = verify_bytes(bytes, expected)?;
    let parent = destination.parent().ok_or("保存目录无效")?;
    let temp = parent.join(format!(".chaotang-save-{}.tmp", uuid::Uuid::new_v4()));
    let mut created = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "无法在目标目录创建文件")?;
        created = true;
        file.write_all(bytes).map_err(|_| "成果写入失败")?;
        file.sync_all().map_err(|_| "成果同步到磁盘失败")?;
        drop(file);
        let written = std::fs::read(&temp).map_err(|_| "无法校验已写入文件")?;
        verify_bytes(&written, &hash)?;
        replace_file(&temp, destination)
            .map_err(|_| "无法完成保存，请检查目标文件权限或占用状态")?;
        Ok(SaveResult {
            status: "saved",
            path: Some(destination.to_string_lossy().into_owned()),
            sha256: Some(hash),
            bytes: Some(bytes.len() as u64),
        })
    })();
    // Only this call's random create-new temporary file is eligible for cleanup.
    if created && temp.exists() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_server_digest_and_rejects_missing_or_mismatched_hash() {
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!(verify_bytes(b"abc", expected).unwrap(), expected);
        assert!(verify_bytes(b"abc", "").is_err());
        assert!(verify_bytes(b"changed", expected).is_err());
        assert!(verify_bytes(b"abc", &"g".repeat(64)).is_err());
        assert!(verify_bytes(b"", expected).is_err());
        assert!(verify_bytes(&vec![0; 32 * 1024 * 1024 + 1], expected).is_err());
    }

    #[test]
    fn filenames_cannot_escape_dialog_directory_or_use_device_names() {
        assert_eq!(safe_filename("报告.xlsx").unwrap(), "报告.xlsx");
        for name in [
            "../report.md",
            "C:\\report.md",
            "CON",
            "aux.txt",
            "com1.md",
            "COM¹.md",
            "CONIN$",
            "CONOUT$.txt",
            "file:ads",
            "a\0b",
            ".",
            "..",
            "trailing.",
            "trailing ",
            "",
        ] {
            assert!(safe_filename(name).is_err(), "{name:?}");
        }
    }

    #[test]
    fn cancellation_returns_no_success_path_or_digest() {
        let result = SaveResult::cancelled();
        assert_eq!(result.status, "cancelled");
        assert!(result.path.is_none());
        assert!(result.sha256.is_none());
        assert!(result.bytes.is_none());
    }

    #[test]
    fn atomic_save_checks_digest_and_preserves_destination_on_failure() {
        let root = std::env::temp_dir().join(format!("ct-save-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let destination = root.join("报告.md");
        std::fs::write(&destination, b"original").unwrap();
        let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert!(atomic_save(&destination, b"changed", hash).is_err());
        assert_eq!(std::fs::read(&destination).unwrap(), b"original");
        let saved = atomic_save(&destination, b"abc", hash).unwrap();
        assert_eq!(saved.status, "saved");
        assert_eq!(saved.sha256.as_deref(), Some(hash));
        assert_eq!(saved.bytes, Some(3));
        assert_eq!(std::fs::read(&destination).unwrap(), b"abc");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        std::fs::remove_file(destination).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn failed_commit_cleans_only_its_temporary_file() {
        let root = std::env::temp_dir().join(format!("ct-save-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let destination = root.join("directory");
        std::fs::create_dir(&destination).unwrap();
        let hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert!(atomic_save(&destination, b"abc", hash).is_err());
        assert!(destination.is_dir());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        std::fs::remove_dir(destination).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
