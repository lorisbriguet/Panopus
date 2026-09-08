//! Encoder tests: PNG/TIFF pixel roundtrips, PDF signature, F4 constants.
//! The export_finish command itself needs an AppHandle + GPU and is
//! covered by the Task 16 manual end-to-end run.

use image::RgbaImage;
use panopus_lib::render::export::{
    encode_pdf, encode_png, encode_tiff, output_settings, F4_MM, F4_PX,
};
use panopus_lib::render::FinishGraphRs;

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
    encode_tiff(&img, &path, false).unwrap();
    let back = image::open(&path).unwrap().to_rgba8();
    assert_eq!(back, img);
}

#[test]
fn tiff_cmyk_writes_nonempty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t-cmyk.tiff");
    encode_tiff(&red_10x14(), &path, true).unwrap();
    assert!(std::fs::metadata(&path).unwrap().len() > 0);
}

#[test]
fn pdf_writes_nonempty_with_signature() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t-f4-300dpi.pdf");
    encode_pdf(&red_10x14(), &path, F4_MM.0, F4_MM.1, 300.0, false).unwrap();
    let bytes = std::fs::read(&path).unwrap();
    assert!(!bytes.is_empty());
    assert!(bytes.starts_with(b"%PDF"), "missing %PDF header");
}

#[test]
fn pdf_cmyk_writes_nonempty_with_signature() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t-cmyk.pdf");
    encode_pdf(&red_10x14(), &path, F4_MM.0, F4_MM.1, 300.0, true).unwrap();
    let bytes = std::fs::read(&path).unwrap();
    assert!(bytes.starts_with(b"%PDF"), "missing %PDF header");
}

fn graph_with_output_params(params: &str) -> FinishGraphRs {
    serde_json::from_str(&format!(
        r#"{{"v":1,"nodes":[
            {{"id":"src","kind":"source","x":0,"y":0}},
            {{"id":"out","kind":"output","params":{params},"x":0,"y":0}}],
        "wires":[{{"from":"src","to":"out","toIn":0}}]}}"#
    ))
    .unwrap()
}

#[test]
fn output_settings_default_to_f4_300_srgb() {
    let s = output_settings(&graph_with_output_params("{}"));
    assert_eq!(s.px, F4_PX);
    assert_eq!(s.mm, F4_MM);
    assert_eq!(s.dpi, 300);
    assert!(!s.cmyk);
}

#[test]
fn output_settings_px_unit_and_cmyk() {
    let s = output_settings(&graph_with_output_params(
        r#"{"unit":"px","width":2000,"height":3000,"dpi":150,"color":"cmyk"}"#,
    ));
    assert_eq!(s.px, (2000, 3000));
    // 2000px at 150dpi = 338.66mm
    assert!((s.mm.0 - 338.666_6).abs() < 0.01, "{}", s.mm.0);
    assert_eq!(s.dpi, 150);
    assert!(s.cmyk);
}

#[test]
fn output_settings_mm_unit_rounds_like_ts() {
    // Mirrors src/lib/finishGraph.ts outputPx: round(mm / 25.4 * dpi).
    let s = output_settings(&graph_with_output_params(
        r#"{"unit":"mm","width":420,"height":594,"dpi":300}"#,
    ));
    assert_eq!(s.px, (4961, 7016)); // A2 at 300dpi
    assert!(!s.cmyk);
}
