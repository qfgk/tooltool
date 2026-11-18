// registry.rs：内置工具清单 + 外部工具注册表（tools.json）
use crate::data;
use crate::create_or_focus_tool;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolWin {
    pub w: f64,
    pub h: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
}

impl Default for ToolWin {
    fn default() -> Self {
        Self { w: 520.0, h: 460.0, x: None, y: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolEntry {
    pub id: String,
    pub name: String,
    /// hosted = 本进程内置模块（独立窗口）；external = 外部程序/脚本
    pub kind: String, // hosted | external
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
    /// external：exe/lnk 路径或 http(s) 链接
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub window: ToolWin,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

impl Default for ToolEntry {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            kind: "external".into(),
            icon: None,
            hotkey: None,
            command: None,
            working_dir: None,
            window: ToolWin::default(),
            enabled: true,
        }
    }
}

/// 面板/托盘展示的内置工具（快速启动已并入主页启动项，不再单独成窗）
pub const HOSTED_TOOLS: &[(&str, &str, f64, f64)] = &[
    ("clipboard", "剪贴板历史", 420.0, 560.0),
    ("toolbox", "工具箱", 660.0, 540.0),
    ("notes", "笔记", 800.0, 580.0),
];

/// 可创建窗口的全部内置工具（含面板不展示的管理窗）
pub const ALL_HOSTED: &[(&str, &str, f64, f64)] = &[
    ("launcher", "启动项管理", 640.0, 520.0),
    HOSTED_TOOLS[0],
    HOSTED_TOOLS[1],
    HOSTED_TOOLS[2],
];

pub fn hosted_tool(id: &str) -> Option<ToolEntry> {
    ALL_HOSTED
        .iter()
        .find(|(hid, _, _, _)| *hid == id)
        .map(|(hid, name, w, h)| ToolEntry {
            id: (*hid).into(),
            name: (*name).into(),
            kind: "hosted".into(),
            window: ToolWin { w: *w, h: *h, x: None, y: None },
            ..Default::default()
        })
}

pub fn tools_json_path() -> PathBuf {
    data::data_dir().join("tools.json")
}

fn read_tools_file() -> Vec<ToolEntry> {
    match std::fs::read_to_string(tools_json_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn write_tools_file(entries: &[ToolEntry]) -> Result<(), String> {
    let s = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    data::write_atomic(&tools_json_path(), &s).map_err(|e| e.to_string())
}

pub struct AppShared {
    pub tools: std::sync::Mutex<Vec<ToolEntry>>,
    pub settings: std::sync::Mutex<serde_json::Value>,
}

pub fn load_shared() -> AppShared {
    let settings: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(data::data_dir().join("settings.json")).unwrap_or_default())
            .unwrap_or(serde_json::json!({ "theme": "auto" }));
    AppShared { tools: std::sync::Mutex::new(read_tools_file()), settings: std::sync::Mutex::new(settings) }
}

/// 全量清单 = 内置工具（外部启动项已统一迁移至 launcher.json，由 quicklaunch 模块管理）
pub fn all_tools(shared: &AppShared) -> Vec<ToolEntry> {
    let custom = shared.tools.lock().unwrap().clone();
    let mut out: Vec<ToolEntry> = Vec::new();
    for (id, name, w, h) in HOSTED_TOOLS {
        let overridden = custom.iter().find(|t| t.id == *id && t.kind == "hosted");
        out.push(match overridden {
            Some(t) => ToolEntry { name: name.to_string(), ..t.clone() },
            None => ToolEntry {
                id: (*id).into(),
                name: (*name).into(),
                kind: "hosted".into(),
                window: ToolWin { w: *w, h: *h, x: None, y: None },
                ..Default::default()
            },
        });
    }
    out
}

#[tauri::command]
pub fn list_tools(state: State<'_, AppShared>) -> Vec<ToolEntry> {
    all_tools(&state)
}

#[tauri::command]
pub fn save_tool(state: State<'_, AppShared>, entry: ToolEntry) -> Result<ToolEntry, String> {
    if entry.id.is_empty() {
        return Err("工具 id 不能为空".into());
    }
    let mut tools = state.tools.lock().unwrap();
    match tools.iter_mut().find(|t| t.id == entry.id) {
        Some(t) => *t = entry.clone(),
        None => tools.push(entry.clone()),
    }
    write_tools_file(&tools)?;
    Ok(entry)
}

#[tauri::command]
pub fn remove_tool(state: State<'_, AppShared>, id: String) -> Result<(), String> {
    if hosted_tool(&id).is_some() {
        return Err("内置工具不可移除".into());
    }
    let mut tools = state.tools.lock().unwrap();
    let before = tools.len();
    tools.retain(|t| t.id != id);
    if tools.len() != before {
        write_tools_file(&tools)?;
    }
    Ok(())
}

/// 全量状态：设置 + 内置工具清单（启动项统一由 quicklaunch 管理）
#[tauri::command]
pub fn get_state(state: State<'_, AppShared>) -> serde_json::Value {
    let settings = state.settings.lock().unwrap().clone();
    serde_json::json!({ "settings": settings, "tools": all_tools(&state) })
}

/// 统一启动入口：hosted → 创建/聚焦工具窗。
/// 注意：hosted 分支必须在独立线程创建窗口——Tauri 已知问题
/// （同步 command 内直接 build 动态窗口会死锁并停留在 about:blank，
///  见 tauri#13092 / #13963），async command + async_runtime::spawn 可规避。
#[tauri::command]
pub async fn launch_tool(app: tauri::AppHandle, state: State<'_, AppShared>, id: String) -> Result<(), String> {
    let entry = all_tools(&state)
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("未找到工具：{id}"))?;
    match entry.kind.as_str() {
        "hosted" => {
            let app = app.clone();
            let id = id.clone();
            tauri::async_runtime::spawn(async move {
                let _ = create_or_focus_tool::<tauri::Wry>(&app, &id);
            });
            Ok(())
        }
        other => Err(format!("未知工具类型：{other}")),
    }
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppShared>, settings: serde_json::Value) -> Result<(), String> {
    let merged = {
        let mut cur = state.settings.lock().unwrap();
        // 浅合并：保留未传字段
        if let (Some(a), Some(b)) = (cur.as_object_mut(), settings.as_object()) {
            for (k, v) in b {
                a.insert(k.clone(), v.clone());
            }
        }
        cur.clone()
    };
    let path = data::data_dir().join("settings.json");
    let s = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    data::write_atomic(&path, &s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    let _ = app.exit(0);
}
