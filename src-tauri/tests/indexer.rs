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
fn latin_font_gets_no_sample_text() {
    // Rye maps 'A'/'a', so the specimen fallback must stay off: the grid
    // keeps rendering the user's proof text for ordinary Latin fonts.
    let m = parse_font(Path::new("tests/fixtures/valid.ttf")).unwrap();
    assert_eq!(m.sample_text, None);
}

#[test]
fn sample_text_column_persists_through_index_all() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V4).unwrap();
    panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures"), &[]).unwrap();
    // The Latin fixture writes NULL — column exists, no bogus specimen.
    let sample: Option<String> = conn
        .query_row(
            "SELECT sample_text FROM fonts WHERE family = 'Rye'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sample, None);
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
    conn.execute_batch(panopus_lib::MIGRATION_V4).unwrap();
    let r1 = panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures"), &[]).unwrap();
    assert!(r1.indexed >= 1 && r1.quarantined >= 1);
    conn.execute("UPDATE fonts SET favorite=1", []).unwrap();
    let r2 = panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures"), &[]).unwrap();
    assert_eq!(r2.indexed, 0);
    let fav: i64 = conn.query_row("SELECT count(*) FROM fonts WHERE favorite=1", [], |r| r.get(0)).unwrap();
    assert!(fav >= 1);
}

#[test]
fn missing_library_root_errors_without_wiping_rows() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V4).unwrap();
    panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures"), &[]).unwrap();
    let before: i64 = conn
        .query_row("SELECT count(*) FROM fonts WHERE is_system=0", [], |r| r.get(0))
        .unwrap();
    assert!(before >= 1);
    let res = panopus_lib::indexer::index_all(&conn, Path::new("tests/fixtures/does-not-exist"), &[]);
    assert!(res.is_err());
    let after: i64 = conn
        .query_row("SELECT count(*) FROM fonts WHERE is_system=0", [], |r| r.get(0))
        .unwrap();
    assert_eq!(before, after);
}

#[test]
fn corrupt_in_place_font_becomes_quarantined() {
    // A font that indexed fine and later fails to parse must flip to
    // quarantined (and lose its active flag) on the next reindex.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("panopus-corrupt-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    let font = dir.join("victim.ttf");
    std::fs::copy("tests/fixtures/valid.ttf", &font).unwrap();

    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V1).unwrap();
    conn.execute_batch(panopus_lib::MIGRATION_V4).unwrap();
    let r1 = panopus_lib::indexer::index_all(&conn, &dir, &[]).unwrap();
    assert_eq!(r1.indexed, 1);
    conn.execute("UPDATE fonts SET active=1", []).unwrap();

    // Corrupt the file in place.
    std::fs::write(&font, b"JUNKJUNKJUNKJUNKJUNKJUNK").unwrap();
    let r2 = panopus_lib::indexer::index_all(&conn, &dir, &[]).unwrap();
    assert_eq!(r2.quarantined, 1);
    let (q, a): (i64, i64) = conn
        .query_row("SELECT quarantined, active FROM fonts", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!((q, a), (1, 0));

    // Re-runs stay incremental: the WHERE guard stops repeat counting.
    let r3 = panopus_lib::indexer::index_all(&conn, &dir, &[]).unwrap();
    assert_eq!(r3.quarantined, 0);

    std::fs::remove_dir_all(&dir).ok();
}
