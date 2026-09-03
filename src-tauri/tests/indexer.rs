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
