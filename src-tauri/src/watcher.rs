//! File system watcher for the library directory with debouncing.
//! Monitors the library root for changes and triggers a full re-index on modification.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::{sync::mpsc, time::Duration};

/// Spawn a background thread to watch the library directory for changes.
/// On file system events, debounce and run a full library re-index.
/// Non-fatal on any error: logs and returns, allowing app to boot normally.
pub fn spawn(app: tauri::AppHandle, library: std::path::PathBuf) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

        // Create a watcher; if it fails (e.g., unsupported FS, perms), log and exit thread.
        let mut w: RecommendedWatcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("watcher init failed: {e}");
                return;
            }
        };

        // Watch the library root recursively; if it fails (e.g., path missing), log and exit.
        if let Err(e) = w.watch(&library, RecursiveMode::Recursive) {
            eprintln!("watcher watch failed: {e}");
            return;
        }

        loop {
            // Block until the first event arrives; if channel closes, exit thread.
            if rx.recv().is_err() {
                break;
            }
            // Debounce: drain any burst of events in the next 2 seconds
            while rx.recv_timeout(Duration::from_secs(2)).is_ok() {}

            // Run a full index; only emit on success
            match crate::indexer::run_full_index(&app) {
                Ok(report) => {
                    use tauri::Emitter;
                    let _ = app.emit("library-changed", &report);
                }
                Err(e) => eprintln!("watcher reindex failed: {e}"),
            }
        }
    });
}
