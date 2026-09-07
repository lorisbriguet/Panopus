//! Encoder tests: PNG/TIFF pixel roundtrips, PDF signature, F4 constants.
//! The export_finish command itself needs an AppHandle + GPU and is
//! covered by the Task 16 manual end-to-end run.

use image::RgbaImage;
use panopus_lib::render::export::{encode_pdf, encode_png, encode_tiff, F4_MM, F4_PX};

fn red_10x14() -> RgbaImage {
    RgbaImage::from_pixel(10, 14, image::Rgba([255, 0, 0, 255]))
}

#[test]
fn f4_constants_match_spec() {
    assert_eq!(F4_PX, (10_571, 15_118));
    assert_eq!(F4_MM, (895.0, 1280.0));
}

#[test]
fn png_roundtrips_pixels() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t-f4-300dpi.png");
    let img = red_10x14();
    encode_png(&img, &path).unwrap();
    let back = image::open(&path).unwrap().to_rgba8();
    assert_eq!(back, img);
}

#[test]
fn tiff_roundtrips_pixels() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t-f4-300dpi.tiff");
    let img = red_10x14();
    encode_tiff(&img, &path).unwrap();
    let back = image::open(&path).unwrap().to_rgba8();
    assert_eq!(back, img);
}

#[test]
fn pdf_writes_nonempty_with_signature() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t-f4-300dpi.pdf");
    encode_pdf(&red_10x14(), &path, F4_MM.0, F4_MM.1).unwrap();
    let bytes = std::fs::read(&path).unwrap();
    assert!(!bytes.is_empty());
    assert!(bytes.starts_with(b"%PDF"), "missing %PDF header");
}
