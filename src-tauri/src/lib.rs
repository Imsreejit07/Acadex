use std::fs;
use std::path::PathBuf;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use rfd::FileDialog;

#[derive(Serialize, Deserialize)]
pub struct OllamaModel {
    name: String,
}

#[derive(Serialize, Deserialize)]
pub struct OllamaResponse {
    models: Vec<OllamaModel>,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    format: String,
}

#[derive(Serialize, Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

const TIMETABLE_SYSTEM_PROMPT: &str = r#"You are a precise college timetable extraction engine. Extract data from OCR/Markdown tables.

Return ONLY valid JSON with this exact shape — no markdown fences, no explanation, no other text:
{
  "subjects": [
    {
      "name": "subject name",
      "code": "course code or SUBJ",
      "faculty": "faculty name or Unknown Faculty",
      "color": "#3B82F6",
      "hasLab": false
    }
  ],
  "timetableEntries": [
    {
      "day": "MONDAY",
      "subjectName": "must match a subjects[].name",
      "componentType": "THEORY",
      "startTime": "09:00",
      "endTime": "10:00"
    }
  ]
}

### UNIVERSAL TIMETABLE PDF PARSING RULES

1. OBJECTIVE & HALLUCINATION PREVENTION (RULE 11, RULE 21, RULE 22)
- Rely strictly on document structure. Never hallucinate or invent subjects, faculty, rooms, timings, or relationships.
- Missing data must remain NULL (or default "Unknown Faculty" / "SUBJ" as defined in schema). Every extracted value should be traceable.

2. DOCUMENT ANALYSIS & TABLE DETECTION (RULE 1, RULE 2, RULE 10)
- Analyze table headers, text blocks, grid boundaries, and merged cells. Process weekly timetables, subject lists, faculty lists, and mapping tables independently.
- Do not merge secondary/legend mapping tables directly into timetable cell texts.

3. TIMETABLE ORIENTATION & LABELS (RULE 3, RULE 4, RULE 5)
- Determine if days are in rows or columns, and if times are in rows or columns.
- Recognize weekdays in all formats (e.g. Monday, Mon, M, MON).
- Detect start and end times. Convert and output in 24-hour HH:mm format. 
- Use explicit AM/PM tags if available, and fallback to implicit afternoon hours (13:00 to 18:00) if the numbers fall in the 1-6 range.

4. BREAKS & SEPARATORS (RULE 6)
- Recognize non-academic slots (Lunch, Break, Tea, Recess, Interval, Free Period) and ignore them. Do not include them in timetableEntries.

5. GRID STRUCTURE & CELL EXTRACTION (RULE 7, RULE 8, RULE 9)
- Preserve row/column coordinates. Empty/blank cells indicate no scheduled session; omit them from timetableEntries.
- Extract complete cell contents (subject name, course code, faculty, room, batch, section, slot code, lecture type).
- Never merge independent subjects. If multiple subject codes (e.g. CS102C and CS204C) appear in the same details or timetable row due to horizontal OCR text merging, discard the merged details and extract the subjects independently directly from the timetable grid cells.
- Use digit-based course codes matching (e.g. /\b([A-Z¢©®]*\d+[A-Z\d¢©®]*)\b/i) to distinguish course codes from generic subject words like CHEMISTRY or PHYSICS.

6. MERGED SESSION DETECTION & DURATION (RULE 12, RULE 13, RULE 14, RULE 15)
- If consecutive timetable cells represent the same session (same subject, faculty, room, adjacent time intervals), merge them into a single entry covering the combined duration.
- NEVER infer LAB/TUTORIAL/WORKSHOP from duration alone. Duration only tells session length, not type.
- Use componentType "LAB" only when the PDF explicitly labels the session/subject as Lab, Practical, Workshop, or similar.
- If session type is not explicit, output componentType "THEORY" because the current app schema only accepts THEORY/LAB, but do not mark hasLab=true unless LAB is explicit.

7. OCR NORMALIZATION (RULE 17)
- Correct common OCR errors when confidence is high (e.g., O ↔ 0, I ↔ 1, S ↔ 5)."#;

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    // Ensure parent directory exists
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    path.push("acadex.db");
    Ok(path)
}

fn get_connection(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // Create state table if not exists
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

    let data: OllamaResponse = res.json().await.map_err(|e| e.to_string())?;
    let model_names = data.models.into_iter().map(|m| m.name).collect();
    Ok(model_names)
}

#[tauri::command]
async fn parse_timetable_desktop(selected_model: String) -> Result<String, String> {
    // 1. Pick file using RFD
    let file_path = FileDialog::new()
        .add_filter("PDF document", &["pdf"])
        .pick_file();

    let path = match file_path {
        Some(p) => p,
        None => return Err("No file selected".to_string()),
    };

    // 2. Extract text natively using pdf-extract
    let pdf_text = pdf_extract::extract_text(&path)
        .map_err(|e| format!("Failed to read text from PDF: {}", e))?;

    if pdf_text.trim().is_empty() {
        return Err("PDF text content is empty. Scanned image PDF is not supported.".to_string());
    }

    // 3. Make chat request to local Ollama
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let req_body = ChatRequest {
        model: selected_model,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: TIMETABLE_SYSTEM_PROMPT.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!("Markdown text of timetable PDF:\n{}", pdf_text),
            },
        ],
        stream: false,
        format: "json".to_string(),
    };

    let res = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Ollama connection error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama API returned status: {}", res.status()));
    }

    let chat_res: ChatResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(chat_res.message.content)
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
        parse_timetable_desktop
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
