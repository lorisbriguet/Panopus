use std::path::Path;
use panopus_lib::indexer::{parse_font, scan_dir};

#[test]
fn parses_valid_ttf() {
    let m = parse_font(Path::new("tests/fixtures/valid.ttf")).unwrap();
    assert_eq!(m.family, "Rye");
    assert_eq!(m.format, "ttf");
    assert!(m.glyph_count > 50);
    assert_eq!(m.hash.len(), 32);
}

#[test]
fn corrupt_font_errors() {
    assert!(parse_font(Path::new("tests/fixtures/corrupt.ttf")).is_err());
}

#[test]
fn scan_filters_noto_when_system() {
    let all = scan_dir(Path::new("tests/fixtures"), false);
    let sys = scan_dir(Path::new("tests/fixtures"), true);
    assert!(all.len() > sys.len());
}

#[test]
fn upsert_preserves_flags_and_is_incremental() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    let r1 = panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures"), &[]).unwrap();
    assert!(r1.indexed >= 1 && r1.quarantined >= 1);
    conn.execute("UPDATE fonts SET favorite=1", []).unwrap();
    let r2 = panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures"), &[]).unwrap();
    assert_eq!(r2.indexed, 0);
    let fav: i64 = conn.query_row("SELECT count(*) FROM fonts WHERE favorite=1", [], |r| r.get(0)).unwrap();
    assert!(fav >= 1);
}
