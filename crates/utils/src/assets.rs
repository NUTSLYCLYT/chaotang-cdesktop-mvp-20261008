use directories::ProjectDirs;
use rust_embed::RustEmbed;

const PROJECT_ROOT: &str = env!("CARGO_MANIFEST_DIR");

pub(crate) fn validate_data_override(
    value: &std::ffi::OsStr,
) -> Result<std::path::PathBuf, &'static str> {
    let path = std::path::PathBuf::from(value);
    if value.is_empty() || !path.is_absolute() {
        return Err("CDESKTOP_DATA_DIR must be a nonempty absolute directory");
    }
    if path.exists() && !path.is_dir() {
        return Err("CDESKTOP_DATA_DIR points to a non-directory");
    }
    Ok(path)
}

fn data_override() -> Option<std::path::PathBuf> {
    std::env::var_os("CDESKTOP_DATA_DIR").map(|value| {
        validate_data_override(&value).expect("Invalid isolated desktop data directory")
    })
}

pub fn asset_dir() -> std::path::PathBuf {
    let path = if let Some(path) = data_override() {
        path
    } else if cfg!(debug_assertions) {
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else {
        prod_asset_dir_path()
    };

    // Ensure the directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("Failed to create asset directory");
    }

    path
    // ✔ macOS → ~/Library/Application Support/MyApp
    // ✔ Linux → ~/.local/share/myapp   (respects XDG_DATA_HOME)
    // ✔ Windows → %APPDATA%\Example\MyApp
}

pub fn prod_asset_dir_path() -> std::path::PathBuf {
    if let Some(path) = data_override() {
        return path;
    }
    ProjectDirs::from("ai", "cdesktop", "cdesktop")
        .expect("OS didn't give us a home directory")
        .data_dir()
        .to_path_buf()
}

pub fn config_path() -> std::path::PathBuf {
    asset_dir().join("config.json")
}

pub fn profiles_path() -> std::path::PathBuf {
    asset_dir().join("profiles.json")
}

pub fn credentials_path() -> std::path::PathBuf {
    asset_dir().join("credentials.json")
}

pub fn trusted_keys_path() -> std::path::PathBuf {
    asset_dir().join("trusted_ed25519_public_keys.json")
}

pub fn server_signing_key_path() -> std::path::PathBuf {
    asset_dir().join("server_ed25519_signing_key")
}

pub fn relay_host_credentials_path() -> std::path::PathBuf {
    asset_dir().join("relay_host_credentials.json")
}

#[derive(RustEmbed)]
#[folder = "../../assets/sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "../../assets/scripts"]
pub struct ScriptAssets;

/// Skill markdown bundled with the cdesktop binary. Currently exposes
/// `cdesktop/SKILL.md` (the agent-teams playbook). Installed to
/// `~/.agent/skills/cdesktop/` and symlinked into every agent-config dir
/// at server startup by `server::skill_install`.
#[derive(RustEmbed)]
#[folder = "../../assets/skills"]
pub struct SkillAssets;

#[cfg(test)]
mod isolation_tests {
    use std::ffi::OsStr;

    use super::validate_data_override;

    #[test]
    fn invalid_override_never_falls_back() {
        assert!(validate_data_override(OsStr::new("")).is_err());
        assert!(validate_data_override(OsStr::new("relative/data")).is_err());
        let existing_file = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        assert!(validate_data_override(existing_file.as_os_str()).is_err());
    }

    #[test]
    fn absolute_override_is_preserved() {
        let path = std::env::temp_dir().join("cdesktop-isolation-validation-only");
        assert_eq!(validate_data_override(path.as_os_str()).unwrap(), path);
    }
}
