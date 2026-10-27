use std::path::Path;

/// Lê um arquivo de texto. Aceita UTF-8 e, como alternativa, Latin-1 (arquivos antigos do VisuAlg).
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {}", path, e))?;
    // remove BOM, se houver
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { &bytes[..] };
    match std::str::from_utf8(bytes) {
        Ok(s) => Ok(s.replace("\r\n", "\n")),
        Err(_) => Ok(bytes.iter().map(|&b| b as char).collect::<String>().replace("\r\n", "\n")),
    }
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&path, content).map_err(|e| format!("{}: {}", path, e))
}

/// Caminho do arquivo passado como argumento na linha de comando (clique duplo num .por/.alg).
#[tauri::command]
fn startup_file() -> Option<String> {
    std::env::args().skip(1).find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file, startup_file])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Portugol IDE");
}
