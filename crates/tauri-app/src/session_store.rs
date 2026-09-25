//! Machine-local persistence for the opaque Chaotang backend session.
//!
//! The WebView never receives this value.  Fusion builds bind it to the
//! launcher-provided installation and backend namespace and, on Windows,
//! protect the payload with DPAPI for the current OS user.

use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};

const FORMAT: u32 = 1;
const MAX_FILE_BYTES: u64 = 64 * 1024;
const STORE_ERROR: &str = "SESSION_PERSISTENCE_UNAVAILABLE: 本机会话无法安全保存";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct PersistedSession {
    format: u32,
    installation_id: String,
    backend_namespace: String,
    session_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Scope {
    installation_id: String,
    backend_namespace: String,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct SessionStore {
    path: Option<PathBuf>,
    scope: Option<Scope>,
}

fn bounded_identifier(value: &str) -> bool {
    (8..=200).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

fn valid_session(value: &str) -> bool {
    (16..=4096).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_graphic())
}

fn safe_root(root: &Path) -> bool {
    root.is_absolute()
        && !root
            .components()
            .any(|part| matches!(part, Component::ParentDir))
}

fn is_reparse_or_link(path: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return false;
    };
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

fn reject_existing_reparse_components(path: &Path) -> Result<(), String> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if current.exists() && is_reparse_or_link(&current) {
            return Err(STORE_ERROR.into());
        }
    }
    Ok(())
}

impl SessionStore {
    pub(crate) fn disabled() -> Self {
        Self::default()
    }

    pub(crate) fn from_environment() -> Result<Self, String> {
        #[cfg(not(windows))]
        {
            // The current persistent implementation deliberately relies on the
            // Windows user-bound DPAPI boundary. Other desktop targets remain
            // memory-only until they have an equivalent native credential store.
            return Ok(Self::disabled());
        }
        #[cfg(windows)]
        {
            let required = std::env::var("CHAOTANG_EXTERNAL_BACKEND_ONLY")
                .ok()
                .as_deref()
                == Some("1");
            let root = std::env::var_os("CDESKTOP_DATA_DIR");
            let installation = std::env::var("CHAOTANG_DESKTOP_INSTALLATION_ID").ok();
            let namespace = std::env::var("CHAOTANG_DESKTOP_BACKEND_NAMESPACE").ok();
            match (root, installation, namespace) {
                (Some(root), Some(installation), Some(namespace)) => {
                    Self::new(Path::new(&root), installation, namespace)
                }
                (None, None, None) if !required => Ok(Self::disabled()),
                _ if !required => Ok(Self::disabled()),
                _ => Err(STORE_ERROR.into()),
            }
        }
    }

    fn new(
        root: &Path,
        installation_id: String,
        backend_namespace: String,
    ) -> Result<Self, String> {
        if !safe_root(root)
            || !bounded_identifier(&installation_id)
            || !bounded_identifier(&backend_namespace)
        {
            return Err(STORE_ERROR.into());
        }
        reject_existing_reparse_components(root)?;
        Ok(Self {
            path: Some(root.join("private").join("chaotang-session-v1.dpapi")),
            scope: Some(Scope {
                installation_id,
                backend_namespace,
            }),
        })
    }

    #[cfg(test)]
    pub(crate) fn for_test(root: &Path) -> Self {
        Self::new(
            root,
            "installation-test-123".into(),
            "namespace-test-123".into(),
        )
        .expect("valid test session store")
    }

    pub(crate) fn load(&self) -> Option<String> {
        self.load_checked().unwrap_or_else(|_| {
            let _ = self.clear();
            None
        })
    }

    fn load_checked(&self) -> Result<Option<String>, String> {
        let (Some(path), Some(scope)) = (&self.path, &self.scope) else {
            return Ok(None);
        };
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(STORE_ERROR.into()),
        };
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_FILE_BYTES
            || is_reparse_or_link(path)
        {
            return Err(STORE_ERROR.into());
        }
        reject_existing_reparse_components(path.parent().ok_or(STORE_ERROR)?)?;
        let mut encrypted = Vec::with_capacity(metadata.len() as usize);
        fs::File::open(path)
            .map_err(|_| STORE_ERROR)?
            .take(MAX_FILE_BYTES + 1)
            .read_to_end(&mut encrypted)
            .map_err(|_| STORE_ERROR)?;
        if encrypted.is_empty() || encrypted.len() as u64 > MAX_FILE_BYTES {
            return Err(STORE_ERROR.into());
        }
        let clear = unprotect(&encrypted, &entropy(scope))?;
        let persisted: PersistedSession =
            serde_json::from_slice(&clear).map_err(|_| STORE_ERROR)?;
        if persisted.format != FORMAT
            || persisted.installation_id != scope.installation_id
            || persisted.backend_namespace != scope.backend_namespace
            || !valid_session(&persisted.session_id)
        {
            return Err(STORE_ERROR.into());
        }
        Ok(Some(persisted.session_id))
    }

    pub(crate) fn save(&self, session_id: &str) -> Result<(), String> {
        let (Some(path), Some(scope)) = (&self.path, &self.scope) else {
            return Ok(());
        };
        if !valid_session(session_id) {
            return Err(STORE_ERROR.into());
        }
        let parent = path.parent().ok_or(STORE_ERROR)?;
        reject_existing_reparse_components(parent)?;
        fs::create_dir_all(parent).map_err(|_| STORE_ERROR)?;
        reject_existing_reparse_components(parent)?;
        if path.exists() && is_reparse_or_link(path) {
            return Err(STORE_ERROR.into());
        }
        let payload = serde_json::to_vec(&PersistedSession {
            format: FORMAT,
            installation_id: scope.installation_id.clone(),
            backend_namespace: scope.backend_namespace.clone(),
            session_id: session_id.to_string(),
        })
        .map_err(|_| STORE_ERROR)?;
        let encrypted = protect(&payload, &entropy(scope))?;
        if encrypted.is_empty() || encrypted.len() as u64 > MAX_FILE_BYTES {
            return Err(STORE_ERROR.into());
        }
        let temporary = parent.join(format!(
            ".chaotang-session-{}.tmp",
            uuid::Uuid::new_v4().simple()
        ));
        let write_result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| STORE_ERROR)?;
            file.write_all(&encrypted).map_err(|_| STORE_ERROR)?;
            file.sync_all().map_err(|_| STORE_ERROR)?;
            replace_file(&temporary, path)
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        write_result
    }

    pub(crate) fn clear(&self) -> Result<(), String> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        match fs::symlink_metadata(path) {
            Ok(metadata) => {
                if !metadata.is_file()
                    || metadata.file_type().is_symlink()
                    || is_reparse_or_link(path)
                {
                    return Err(STORE_ERROR.into());
                }
                fs::remove_file(path).map_err(|_| STORE_ERROR.to_string())
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(STORE_ERROR.into()),
        }
    }
}

fn entropy(scope: &Scope) -> Vec<u8> {
    format!(
        "chaotang-session-v1\0{}\0{}",
        scope.installation_id, scope.backend_namespace
    )
    .into_bytes()
}

#[cfg(windows)]
fn protect(clear: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData},
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: clear.len().try_into().map_err(|_| STORE_ERROR)?,
        pbData: clear.as_ptr().cast_mut(),
    };
    let optional = CRYPT_INTEGER_BLOB {
        cbData: entropy.len().try_into().map_err(|_| STORE_ERROR)?,
        pbData: entropy.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            &optional,
            std::ptr::null_mut(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err(STORE_ERROR.into());
    }
    let protected = unsafe {
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(protected)
}

#[cfg(windows)]
fn unprotect(encrypted: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: encrypted.len().try_into().map_err(|_| STORE_ERROR)?,
        pbData: encrypted.as_ptr().cast_mut(),
    };
    let optional = CRYPT_INTEGER_BLOB {
        cbData: entropy.len().try_into().map_err(|_| STORE_ERROR)?,
        pbData: entropy.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            &optional,
            std::ptr::null_mut(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err(STORE_ERROR.into());
    }
    let clear = unsafe {
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(clear)
}

#[cfg(not(windows))]
fn protect(_clear: &[u8], _entropy: &[u8]) -> Result<Vec<u8>, String> {
    Err(STORE_ERROR.into())
}

#[cfg(not(windows))]
fn unprotect(_encrypted: &[u8], _entropy: &[u8]) -> Result<Vec<u8>, String> {
    Err(STORE_ERROR.into())
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let ok = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(STORE_ERROR.into())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination).map_err(|_| STORE_ERROR.into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    fn fixture(name: &str) -> (PathBuf, SessionStore) {
        let root = std::env::temp_dir().join(format!(
            "chaotang-session-store-{name}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        let store = SessionStore::new(
            &root,
            "installation-test-123".into(),
            "namespace-test-123".into(),
        )
        .unwrap();
        (root, store)
    }

    #[test]
    fn encrypted_session_survives_a_new_store_instance_and_clear_removes_it() {
        let (root, first) = fixture("restart");
        first.save("opaque-session-value-123456").unwrap();
        let raw = fs::read(first.path.as_ref().unwrap()).unwrap();
        assert!(
            !raw.windows(24)
                .any(|part| part == b"opaque-session-value-123")
        );
        let second = SessionStore::new(
            &root,
            "installation-test-123".into(),
            "namespace-test-123".into(),
        )
        .unwrap();
        assert_eq!(
            second.load().as_deref(),
            Some("opaque-session-value-123456")
        );
        second.clear().unwrap();
        assert_eq!(first.load(), None);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn scope_mismatch_and_malformed_or_non_file_state_fail_closed() {
        let (root, store) = fixture("closed");
        store.save("opaque-session-value-654321").unwrap();
        let foreign = SessionStore::new(
            &root,
            "installation-test-999".into(),
            "namespace-test-123".into(),
        )
        .unwrap();
        assert_eq!(foreign.load(), None);
        store.save("opaque-session-value-654321").unwrap();
        fs::write(store.path.as_ref().unwrap(), b"not-dpapi").unwrap();
        assert_eq!(store.load(), None);
        let path = store.path.as_ref().unwrap();
        fs::create_dir_all(path).unwrap();
        assert_eq!(store.load(), None);
        fs::remove_dir_all(root).unwrap();
    }
}
