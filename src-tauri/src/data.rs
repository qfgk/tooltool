// data.rs：数据目录 / 原子写 / 启动备份（移植自 PinTodo，命名空间改为 tooltool）
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static ID_SEQ: AtomicU64 = AtomicU64::new(1);

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn new_id() -> String {
    let n = ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{:x}-{:x}", now_ms(), n)
}

pub fn data_dir() -> PathBuf {
    dirs_data()
}

fn dirs_data() -> PathBuf {
    // %APPDATA%\tooltool
    let mut p = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    p.push("tooltool");
    let _ = fs::create_dir_all(&p);
    p
}

/// 原子写：先写 .tmp 再替换，杜绝半截 JSON
pub fn write_atomic(path: &std::path::Path, content: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.flush()?;
    }
    fs::rename(&tmp, path)
}

/// 防抖持久化队列（与 PinTodo 相同模式）
/// 启动备份：把关键 json 滚动备份到 backup/，保留最近 7 份
pub fn backup_on_boot() {
    let dir = data_dir().join("backup");
    let _ = fs::create_dir_all(&dir);
    for name in ["settings.json", "tools.json", "launcher.json", "trash.json"] {
        let src = data_dir().join(name);
        if !src.exists() {
            continue;
        }
        let stamp = chrono_like_stamp();
        let dest = dir.join(format!(
            "{}-{}",
            name.trim_end_matches(".json"),
            stamp
        ));
        let dest = dest.with_extension("json");
        let _ = fs::copy(&src, &dest);
    }
    // 清理旧备份：仅保留最近 7 份（按文件名排序）
    if let Ok(entries) = fs::read_dir(&dir) {
        let mut files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();
        files.sort();
        while files.len() > 28 {
            let first = files.remove(0);
            let _ = fs::remove_file(first);
        }
    }
}

fn chrono_like_stamp() -> String {
    // 20261118-153000 格式
    let secs = now_ms() / 1000;
    let days = secs / 86400;
    let rem = secs % 86400;
    // 简化 civil 算法（Howard Hinnant）
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let h = rem / 3600;
    let mi = (rem % 3600) / 60;
    let s = rem % 60;
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        y, m, d, h, mi, s
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_format() {
        let s = chrono_like_stamp();
        assert_eq!(s.len(), 15);
        assert_eq!(s.as_bytes()[8], b'-');
    }

    #[test]
    fn atomic_write_roundtrip() {
        let dir = std::env::temp_dir().join("tooltool-test");
        let _ = fs::create_dir_all(&dir);
        let p = dir.join("t.json");
        write_atomic(&p, "{\"a\":1}").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"a\":1}");
        let _ = fs::remove_file(&p);
    }
}
