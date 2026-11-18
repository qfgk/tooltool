// quicklaunch.rs：统一启动项数据层 + 文件夹扫描批量导入 + 执行
// launcher.json: [{ id, name, kind: app|dir|url, target }]
// 执行统一走 opener 插件（系统默认方式打开 exe/lnk/目录/URL，最稳）
use crate::data;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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

/// 一次性迁移：旧 tools.json 的 external 条目 → launcher.json（仅在 launcher.json 不存在时）
pub fn migrate_from_tools() {
    let lj = launcher_json_path();
    if lj.exists() {
        return;
    }
    let tools_path = data::data_dir().join("tools.json");
    let Ok(s) = std::fs::read_to_string(&tools_path) else { return };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) else { return };
    let mut migrated: Vec<QlEntry> = Vec::new();
    if let Some(arr) = val.as_array() {
        for t in arr {
            if t["kind"] == "external" {
                let name = t["name"].as_str().unwrap_or("").to_string();
                let command = t["command"].as_str().unwrap_or("").to_string();
                if name.is_empty() || command.is_empty() {
                    continue;
                }
                migrated.push(QlEntry {
                    id: data::new_id(),
                    name,
                    kind: "app".into(),
                    target: command,
                });
            }
        }
    }
    if !migrated.is_empty() {
        let _ = write_entries(&migrated);
    }
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

/// 批量添加（扫描导入用）；返回成功条数
#[tauri::command]
pub fn ql_add_batch(entries: Vec<QlEntry>) -> Result<usize, String> {
    let mut all = read_entries();
    let mut added = 0usize;
    for mut e in entries {
        e.name = e.name.trim().to_string();
        e.target = e.target.trim().to_string();
        if validate(&e).is_err() {
            continue;
        }
        // 去重：同 target 已存在则跳过
        if all.iter().any(|x| x.target == e.target) {
            continue;
        }
        e.id = format!("ql-{}", data::new_id());
        all.push(e);
        added += 1;
    }
    if added > 0 {
        write_entries(&all)?;
    }
    Ok(added)
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

/// 扫描文件夹中的可执行文件（exe/lnk，一层深度），返回 {name, path, kind:"app"}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanItem {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[tauri::command]
pub fn scan_folder(dir: String) -> Result<Vec<ScanItem>, String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Err(format!("不是有效文件夹：{dir}"));
    }
    let mut out: Vec<ScanItem> = Vec::new();
    let rd = std::fs::read_dir(&path).map_err(|e| format!("读取目录失败：{e}"))?;
    for entry in rd.flatten() {
        let p = entry.path();
        let Some(ext) = p.extension() else { continue };
        let ext = ext.to_string_lossy().to_lowercase();
        if ext != "exe" && ext != "lnk" {
            continue;
        }
        // 跳过卸载器/临时文件
        let name = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let lower = name.to_lowercase();
        if lower.contains("uninst") || lower.contains("unins") || lower.starts_with('.') {
            continue;
        }
        out.push(ScanItem {
            name,
            path: p.to_string_lossy().to_string(),
            kind: "app".into(),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
