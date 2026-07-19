use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use rfd::FileDialog;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PdfTextItem {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub page_number: u32,
    pub font_size: Option<f64>,
    pub font_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PdfPage {
    pub page_number: u32,
    pub width: f64,
    pub height: f64,
    pub orientation: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PdfExtractionResult {
    pub pages: Vec<PdfPage>,
    pub text_items: Vec<PdfTextItem>,
    pub total_pages: u32,
    pub success: bool,
    pub error: Option<String>,
}

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    path.push("acadex.db");
    Ok(path)
}

fn get_connection(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn)
}

fn get_project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("project root")
        .to_path_buf()
}

fn resolve_parser_command(app_handle: &tauri::AppHandle) -> Result<(PathBuf, Vec<String>), String> {
    let project_root = get_project_root();
    let bundled_cli = project_root.join("dist").join("parse-timetable-cli.cjs");

    if bundled_cli.exists() {
        return Ok((
            which_node()?,
            vec![
                bundled_cli.to_string_lossy().to_string(),
            ],
        ));
    }

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    let resource_cli = resource_dir.join("parser").join("parse-timetable-cli.cjs");
    if resource_cli.exists() {
        return Ok((
            which_node()?,
            vec![resource_cli.to_string_lossy().to_string()],
        ));
    }

    let ts_cli = project_root.join("scripts").join("parse-timetable-cli.ts");
    if ts_cli.exists() {
        return Ok((
            which_npx()?,
            vec![
                "tsx".to_string(),
                ts_cli.to_string_lossy().to_string(),
            ],
        ));
    }

    Err("Timetable parser CLI not found. Rebuild the application.".to_string())
}

fn which_node() -> Result<PathBuf, String> {
    Command::new("node")
        .arg("--version")
        .output()
        .map(|_| PathBuf::from("node"))
        .map_err(|e| format!("Node.js is required to run the timetable parser: {}", e))
}

fn which_npx() -> Result<PathBuf, String> {
    Command::new("npx")
        .arg("--version")
        .output()
        .map(|_| PathBuf::from("npx"))
        .map_err(|e| format!("npx is required to run the timetable parser: {}", e))
}

fn load_env_file(project_root: &Path) {
    let env_path = project_root.join(".env.local");
    if !env_path.exists() {
        return;
    }

    let Ok(contents) = fs::read_to_string(env_path) else {
        return;
    };

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        if std::env::var(key).is_err() {
            std::env::set_var(key, value.trim().trim_matches('"'));
        }
    }
}

#[tauri::command]
async fn load_local_state(app_handle: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let conn = get_connection(&app_handle)?;
    let mut stmt = conn
        .prepare("SELECT value FROM app_state WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let val: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(val))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn save_local_state(app_handle: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "INSERT INTO app_state (key, value, updated_at) 
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET 
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_ollama_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .map_err(|e| format!("Ollama not running: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama API returned error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct OllamaModel {
        name: String,
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        models: Vec<OllamaModel>,
    }

    let data: OllamaResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
async fn pick_timetable_pdf() -> Result<Option<String>, String> {
    let file_path = FileDialog::new()
        .add_filter("PDF document", &["pdf"])
        .pick_file();

    match file_path {
        Some(p) => Ok(Some(p.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
async fn extract_pdf_coordinates(file_path: String) -> Result<PdfExtractionResult, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Ok(PdfExtractionResult {
            pages: vec![],
            text_items: vec![],
            total_pages: 0,
            success: false,
            error: Some(format!("File not found: {}", file_path)),
        });
    }

    match pdf_extract::extract_text(&path) {
        Ok(text) => {
            let pages = vec![PdfPage {
                page_number: 1,
                width: 595.0,
                height: 842.0,
                orientation: "portrait".to_string(),
            }];

            let text_lines: Vec<&str> = text.lines().collect();
            let line_height = 12.0;
            let max_y = 842.0;

            let text_items: Vec<PdfTextItem> = text_lines
                .iter()
                .enumerate()
                .map(|(i, line)| PdfTextItem {
                    text: line.to_string(),
                    x: 50.0,
                    y: max_y - ((i as f64 + 1.0) * line_height),
                    width: line.len() as f64 * 5.0,
                    height: line_height,
                    page_number: 1,
                    font_size: Some(10.0),
                    font_name: None,
                })
                .collect();

            Ok(PdfExtractionResult {
                pages,
                text_items,
                total_pages: 1,
                success: true,
                error: None,
            })
        }
        Err(e) => Ok(PdfExtractionResult {
            pages: vec![],
            text_items: vec![],
            total_pages: 0,
            success: false,
            error: Some(format!("PDF extraction failed: {}", e)),
        }),
    }
}

#[tauri::command]
async fn parse_timetable_desktop(
    app_handle: tauri::AppHandle,
    file_path: String,
    selected_model: String,
) -> Result<String, String> {
    let project_root = get_project_root();
    load_env_file(&project_root);

    if std::env::var("OLLAMA_BASE_URL").is_err() {
        std::env::set_var("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    }
    if std::env::var("OLLAMA_MODEL").is_err() && !selected_model.is_empty() {
        std::env::set_var("OLLAMA_MODEL", selected_model);
    }

    let (program, mut args) = resolve_parser_command(&app_handle)?;
    args.push(file_path);

    let output = Command::new(program)
        .args(args)
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to launch timetable parser: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Timetable parser failed.\n{}\n{}",
            stderr.trim(),
            stdout.trim()
        ));
    }

    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    if stdout.trim().is_empty() {
        return Err("Timetable parser returned empty output".to_string());
    }

    Ok(stdout)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_local_state,
            save_local_state,
            get_ollama_models,
            pick_timetable_pdf,
            parse_timetable_desktop,
            extract_pdf_coordinates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
