use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Lê um arquivo de texto. Aceita UTF-8 e, como alternativa, Latin-1 (arquivos antigos em Windows-1252).
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

// ======================= projeto (pasta) =======================

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    path: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<DirEntry>>,
}

const SOURCE_EXTS: [&str; 1] = ["koi"];
const SKIP_DIRS: [&str; 10] = ["node_modules", "target", "dist", "build", "out", "__pycache__", "bin", "obj", "$RECYCLE.BIN", "System Volume Information"];
const MAX_DEPTH: usize = 12;
const MAX_ENTRIES: usize = 5000;

fn is_source(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| SOURCE_EXTS.iter().any(|s| s.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn list_dir_rec(dir: &Path, depth: usize, count: &mut usize) -> Result<Vec<DirEntry>, String> {
    if depth > MAX_DEPTH {
        return Ok(vec![]);
    }
    let mut dirs: Vec<DirEntry> = vec![];
    let mut files: Vec<DirEntry> = vec![];
    let rd = std::fs::read_dir(dir).map_err(|e| format!("{}: {}", dir.display(), e))?;
    for entry in rd.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        *count += 1;
        if *count > MAX_ENTRIES {
            return Err("A pasta tem arquivos demais para ser aberta como projeto. Abra uma subpasta.".into());
        }
        if meta.is_dir() {
            if name.starts_with('.') || SKIP_DIRS.iter().any(|s| s.eq_ignore_ascii_case(&name)) {
                continue;
            }
            // não segue links simbólicos
            if entry.file_type().map(|t| t.is_symlink()).unwrap_or(false) {
                continue;
            }
            let children = list_dir_rec(&path, depth + 1, count)?;
            dirs.push(DirEntry { name, path: path.to_string_lossy().to_string(), kind: "dir", children: Some(children) });
        } else if meta.is_file() && is_source(&path) {
            files.push(DirEntry { name, path: path.to_string_lossy().to_string(), kind: "file", children: None });
        }
    }
    let key = |e: &DirEntry| e.name.to_lowercase();
    dirs.sort_by_key(key);
    files.sort_by_key(key);
    dirs.extend(files);
    Ok(dirs)
}

/// Lista recursivamente a pasta do projeto: só pastas e arquivos .koi.
#[tauri::command]
fn list_dir(root: String) -> Result<DirEntry, String> {
    let p = PathBuf::from(&root);
    if !p.is_dir() {
        return Err(format!("{} não é uma pasta", root));
    }
    let mut count = 0usize;
    let children = list_dir_rec(&p, 0, &mut count)?;
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| root.clone());
    Ok(DirEntry { name, path: root, kind: "dir", children: Some(children) })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInfo {
    exists: bool,
    is_dir: bool,
    mtime_ms: u64,
}

#[tauri::command]
fn stat_path(path: String) -> Result<PathInfo, String> {
    match std::fs::metadata(&path) {
        Ok(m) => {
            let mtime_ms = m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            Ok(PathInfo { exists: true, is_dir: m.is_dir(), mtime_ms })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(PathInfo { exists: false, is_dir: false, mtime_ms: 0 }),
        Err(e) => Err(format!("{}: {}", path, e)),
    }
}

/// Cria um arquivo novo; erro se já existir.
#[tauri::command]
fn create_file(path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists { "Já existe um arquivo com esse nome".to_string() } else { format!("{}: {}", path, e) })?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("Já existe uma pasta com esse nome".into());
    }
    std::fs::create_dir_all(&path).map_err(|e| format!("{}: {}", path, e))
}

/// Renomeia/move. Recusa sobrescrever (exceto troca só de maiúsculas no mesmo nome).
#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    let same_ignoring_case = from.eq_ignore_ascii_case(&to);
    if !same_ignoring_case && Path::new(&to).exists() {
        return Err("Já existe um arquivo ou pasta com esse nome".into());
    }
    std::fs::rename(&from, &to).map_err(|e| format!("{}: {}", from, e))
}

/// Envia para a lixeira.
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("{}: {}", path, e))
}

/// Mostra o arquivo/pasta no gerenciador de arquivos do sistema.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    #[cfg(target_os = "windows")]
    {
        let arg = if p.is_dir() { path.clone() } else { format!("/select,{}", path) };
        std::process::Command::new("explorer").arg(arg).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let mut c = std::process::Command::new("open");
        if p.is_dir() { c.arg(&path); } else { c.arg("-R").arg(&path); }
        c.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = if p.is_dir() { p.to_path_buf() } else { p.parent().map(|x| x.to_path_buf()).unwrap_or_else(|| p.to_path_buf()) };
        std::process::Command::new("xdg-open").arg(target).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupArg {
    path: String,
    is_dir: bool,
}

/// Caminho (arquivo ou pasta) passado como argumento na linha de comando.
#[tauri::command]
fn startup_path() -> Option<StartupArg> {
    std::env::args().skip(1).find(|a| !a.starts_with('-') && Path::new(a).exists()).map(|a| {
        let is_dir = Path::new(&a).is_dir();
        StartupArg { path: a, is_dir }
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file, write_file, list_dir, stat_path, create_file, create_dir, rename_path, delete_path, reveal_path, startup_path
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Koiné IDE");
}
