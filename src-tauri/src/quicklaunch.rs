// quicklaunch.rs：快速启动器数据层与执行
// launcher.json: [{ id, name, kind: app|dir|url, target }]
// 执行统一走 opener 插件（系统默认方式打开 exe/目录/URL，最稳）
use crate::data;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QlEntry {
    pub id: String,
    pub name: String,
    /// app = 程序/文件；dir = 文件夹；url = 网址
    pub kind: String,
    pub target: String,
}

pub fn launcher_json_path() -> PathBuf {
    data::data_dir().join("launcher.json")
}

pub fn read_entries() -> Vec<QlEntry> {
    match std::fs::read_to_string(launcher_json_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn write_entries(entries: &[QlEntry]) -> Result<(), String> {
    let s = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    data::write_atomic(&launcher_json_path(), &s).map_err(|e| e.to_string())
}

fn validate(entry: &QlEntry) -> Result<(), String> {
    if entry.name.trim().is_empty() || entry.target.trim().is_empty() {
        return Err("名称与目标不能为空".into());
    }
    match entry.kind.as_str() {
        "url" => {
            if !entry.target.starts_with("http://") && !entry.target.starts_with("https://") {
                return Err("网址必须以 http:// 或 https:// 开头".into());
            }
        }
        "app" | "dir" => {
            let p = PathBuf::from(entry.target.trim());
            if !p.exists() {
                return Err(format!("目标不存在：{}", entry.target));
            }
            if entry.kind == "dir" && !p.is_dir() {
                return Err(format!("目标不是文件夹：{}", entry.target));
            }
        }
        other => return Err(format!("未知类型：{other}")),
    }
    Ok(())
}

#[tauri::command]
pub fn ql_list() -> Vec<QlEntry> {
    read_entries()
}

#[tauri::command]
pub fn ql_save(entry: QlEntry) -> Result<QlEntry, String> {
    let mut e = entry;
    e.name = e.name.trim().to_string();
    e.target = e.target.trim().to_string();
    validate(&e)?;
    let mut entries = read_entries();
    if e.id.is_empty() {
        e.id = format!("ql-{}", data::new_id());
        entries.push(e.clone());
    } else {
        match entries.iter_mut().find(|x| x.id == e.id) {
            Some(x) => *x = e.clone(),
            None => return Err(format!("条目不存在：{}", e.id)),
        }
    }
    write_entries(&entries)?;
    Ok(e)
}

#[tauri::command]
pub fn ql_delete(id: String) -> Result<(), String> {
    let mut entries = read_entries();
    let before = entries.len();
    entries.retain(|x| x.id != id);
    if entries.len() == before {
        return Err(format!("条目不存在：{id}"));
    }
    write_entries(&entries)?;
    Ok(())
}

/// 执行条目：app/dir 走系统默认方式打开；url 交给默认浏览器
#[tauri::command]
pub fn ql_run(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let entries = read_entries();
    let e = entries
        .iter()
        .find(|x| x.id == id)
        .ok_or_else(|| format!("条目不存在：{id}"))?;
    let opener = app.opener();
    match e.kind.as_str() {
        "url" => opener.open_url(&e.target, None::<&str>).map_err(|x| x.to_string()),
        _ => opener.open_path(&e.target, None::<&str>).map_err(|x| x.to_string()),
    }
}
