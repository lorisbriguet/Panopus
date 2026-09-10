//! Tests for the artwork bytes reader. The `read_artwork_bytes` command is
//! a thin `tauri::ipc::Response` wrapper around `read_artwork_file`; the
//! wrapper is untestable without an IPC harness, so these exercise the
//! inner function directly (same split as activation's set_active_in_db).

use std::fs;

#[test]
fn reads_bytes_from_a_png_named_file() {
    let path = std::env::temp_dir().join("panopus_artwork_test.png");
    fs::write(&path, [1u8, 2, 3]).unwrap();
    let bytes = panopus_lib::read_artwork_file(path.to_str().unwrap()).unwrap();
    fs::remove_file(&path).ok();
    assert_eq!(bytes, vec![1, 2, 3]);
}

#[test]
fn extension_check_is_case_insensitive() {
    let path = std::env::temp_dir().join("panopus_artwork_test.TIF");
    fs::write(&path, [9u8]).unwrap();
    let bytes = panopus_lib::read_artwork_file(path.to_str().unwrap()).unwrap();
    fs::remove_file(&path).ok();
    assert_eq!(bytes, vec![9]);
}

#[test]
fn rejects_non_image_extensions() {
    // Extension gate fires before any filesystem access, so the path
    // doesn't need to exist.
    let err = panopus_lib::read_artwork_file("/tmp/notes.txt").unwrap_err();
    assert!(err.contains("unsupported"), "unexpected error: {err}");
}

#[test]
fn missing_file_with_allowed_extension_errors() {
    let err = panopus_lib::read_artwork_file("/nonexistent/panopus_missing.png").unwrap_err();
    assert!(err.contains("read"), "unexpected error: {err}");
}
