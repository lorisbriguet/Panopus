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

#[test]
fn output_settings_for_reads_each_node() {
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"print","kind":"output","params":{"name":"f4-print"},"x":0,"y":0},
            {"id":"ig","kind":"output","params":{"name":"ig-square","unit":"px","width":1080,"height":1080,"dpi":72},"x":0,"y":0}],
        "wires":[
            {"from":"src","to":"print","toIn":0},
            {"from":"src","to":"ig","toIn":0}]}"#,
    )
    .unwrap();
    let print = panopus_lib::render::export::output_settings_for(&graph, "print");
    assert_eq!(print.px, F4_PX);
    assert_eq!(print.name, "f4-print");
    let ig = panopus_lib::render::export::output_settings_for(&graph, "ig");
    assert_eq!(ig.px, (1080, 1080));
    assert_eq!(ig.name, "ig-square");
    // unknown id falls back to the first output
    let fb = panopus_lib::render::export::output_settings_for(&graph, "nope");
    assert_eq!(fb.name, "f4-print");
}

#[test]
fn assemble_sources_maps_primary_and_extra_nodes() {
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"srcA","kind":"source","x":0,"y":0},
            {"id":"srcB","kind":"source","sourcePath":"/art/layer.png","x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"srcA","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let paths =
        panopus_lib::render::export::assemble_source_paths(&graph, "/art/main.png").unwrap();
    assert_eq!(paths.len(), 2);
    assert_eq!(paths[0], ("srcA".to_string(), "/art/main.png".to_string()));
    assert_eq!(paths[1], ("srcB".to_string(), "/art/layer.png".to_string()));
}

#[test]
fn assemble_sources_errors_on_extra_without_path() {
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"srcA","kind":"source","x":0,"y":0},
            {"id":"srcB","kind":"source","x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[{"from":"srcA","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let err = panopus_lib::render::export::assemble_source_paths(&graph, "/art/main.png")
        .unwrap_err();
    assert!(err.contains("srcB"), "{err}");
}

#[test]
fn save_raster_in_writes_and_returns_path() {
    let dir = tempfile::tempdir().unwrap();
    let bytes = {
        // any bytes will do - the fn stores, it doesn't decode
        vec![137u8, 80, 78, 71, 0, 1, 2, 3]
    };
    let path =
        panopus_lib::render::export::save_raster_in(dir.path(), 7, "text_123", &bytes).unwrap();
    assert!(path.ends_with("7-text_123.png"), "{path:?}");
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    // overwrite is fine
    let again =
        panopus_lib::render::export::save_raster_in(dir.path(), 7, "text_123", &[9]).unwrap();
    assert_eq!(again, path);
    assert_eq!(std::fs::read(&path).unwrap(), vec![9]);
}

#[test]
fn font_coverage_reports_missing_chars() {
    // AMDAL-style scenario (#416): a face without Latin coverage. Use a
    // real library font if present, else skip.
    let lib = std::path::Path::new(env!("HOME"))
        .join("Documents/GitHub/panopus-library/velvetyne/amdal/AMDAL-Regular.otf");
    if !lib.is_file() {
        eprintln!("skipping: no AMDAL sample");
        return;
    }
    let missing =
        panopus_lib::render::export::font_missing_chars(&lib, "TEST ⴰⵎⴷⴰⵍ").unwrap();
    assert!(missing.contains(&'T'), "{missing:?}");
    assert!(missing.contains(&'E'), "{missing:?}");
    assert!(!missing.contains(&'ⴰ'), "{missing:?}");
    assert!(!missing.contains(&' '), "space should not be reported: {missing:?}");
}
