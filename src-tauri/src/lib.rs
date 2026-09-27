use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

fn safe_export_file_name(file_name: &str) -> Result<&str, String> {
    let path = Path::new(file_name);
    let safe_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty() && *value != "." && *value != "..")
        .ok_or_else(|| "invalid_export_file_name".to_string())?;
    if safe_name != file_name || safe_name.contains(':') {
        return Err("invalid_export_file_name".to_string());
    }
    Ok(safe_name)
}

fn export_download_path(file_name: &str) -> Result<PathBuf, String> {
    let safe_name = safe_export_file_name(file_name)?;
    let user_profile = env::var("USERPROFILE")
        .map_err(|error| format!("export_user_profile_unavailable:{error}"))?;
    let download_dir = PathBuf::from(user_profile).join("Downloads");
    Ok(download_dir.join(safe_name))
}

#[tauri::command]
fn write_export_chunk(file_name: String, bytes: Vec<u8>, append: bool) -> Result<(), String> {
    let path = export_download_path(&file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("export_download_directory_failed:{error}"))?;
    }
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }
    let mut file = options
        .open(&path)
        .map_err(|error| format!("export_file_open_failed:{error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("export_file_write_failed:{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::safe_export_file_name;

    #[test]
    fn rejects_path_traversal_export_names() {
        assert!(safe_export_file_name("..\\result.xlsx").is_err());
        assert!(safe_export_file_name("C:\\result.xlsx").is_err());
        assert_eq!(safe_export_file_name("result.xlsx"), Ok("result.xlsx"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![write_export_chunk])
        .run(tauri::generate_context!())
        .expect("failed to run GITT/DCR scientific workbench");
}
