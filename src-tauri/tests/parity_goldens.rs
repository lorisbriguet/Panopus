//! Golden writer for the preview/export parity harness (Task 15 / P1-T4).
//! Ignored by default — run it to (re)generate the committed goldens:
//!
//!     cargo test --test parity_goldens -- --ignored
//!
//! Renders every graph CASE in test/parity/cases/*.json through the wgpu
//! engine: one golden per output node — `<case>.png` for single-output
//! cases, `<case>-<outputname>.png` otherwise. `npm run parity` renders
//! the same cases through the WebGL2 executor and diffs against these.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use panopus_lib::render::engine::{fit_mode_for, place_fit};
use panopus_lib::render::export::output_settings_for;
use panopus_lib::render::FinishGraphRs;

const W: u32 = 512;
const H: u32 = 731;

fn parity_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../test/parity")
}

/// Gradient + hard-edged circle: structure for the dithers/DCTs, ramps
/// for the color paths. Only written when missing so the committed PNG
/// bytes stay stable; both engines read the same file.
fn ensure_source(path: &Path) -> image::RgbaImage {
    if path.is_file() {
        return image::open(path).unwrap().to_rgba8();
    }
    let img = image::RgbaImage::from_fn(W, H, |x, y| {
        let dx = x as f32 - 256.0;
        let dy = y as f32 - 365.0;
        if (dx * dx + dy * dy).sqrt() < 140.0 {
            image::Rgba([235, 64, 44, 255])
        } else {
            image::Rgba([
                (x as f32 / (W - 1) as f32 * 255.0) as u8,
                (y as f32 / (H - 1) as f32 * 255.0) as u8,
                168,
                255,
            ])
        }
    });
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    img.save(path).unwrap();
    img
}

/// Second source for composite cases: inverted ramps + an offset dark
/// circle so blends against source.png are visually obvious.
fn ensure_source2(path: &Path) -> image::RgbaImage {
    if path.is_file() {
        return image::open(path).unwrap().to_rgba8();
    }
    let img = image::RgbaImage::from_fn(W, H, |x, y| {
        let dx = x as f32 - 150.0;
        let dy = y as f32 - 200.0;
        if (dx * dx + dy * dy).sqrt() < 100.0 {
            image::Rgba([20, 24, 60, 255])
        } else {
            image::Rgba([
                255 - (x as f32 / (W - 1) as f32 * 255.0) as u8,
                255 - (y as f32 / (H - 1) as f32 * 255.0) as u8,
                64,
                255,
            ])
        }
    });
    img.save(path).unwrap();
    img
}

/// Synthetic "text" raster for D3 parity: white glyph-ish bars on
/// transparent (parity never needs real font rasterization in Rust).
/// 512x128 — aspect 4, matching the case's rasterAspect param.
fn ensure_text_raster(path: &Path) {
    if path.is_file() {
        return;
    }
    let img = image::RgbaImage::from_fn(512, 128, |x, y| {
        let bar = (x / 64) % 2 == 0;
        let body = y > 16 && y < 112;
        let notch = bar && y > 40 && y < 72 && (x % 64) > 40;
        if body && bar && !notch {
            image::Rgba([255, 255, 255, 255])
        } else {
            image::Rgba([0, 0, 0, 0])
        }
    });
    img.save(path).unwrap();
}

#[derive(serde::Deserialize)]
struct Case {
    name: String,
    graph: FinishGraphRs,
}

#[test]
#[ignore = "writes test/parity/goldens; pre-release, see RELEASING.md"]
fn write_goldens() {
    let mut engine = panopus_lib::render::engine::RenderEngine::new().expect("GPU required");
    let shaders = Path::new(env!("CARGO_MANIFEST_DIR")).join("../shaders");
    let effects = panopus_lib::render::manifest::load_effects(&shaders).unwrap();
    let dir = parity_dir();
    let source = ensure_source(&dir.join("source.png"));
    ensure_source2(&dir.join("source2.png"));
    ensure_text_raster(&dir.join("text-raster.png"));
    let goldens = dir.join("goldens");
    std::fs::create_dir_all(&goldens).unwrap();

    let mut case_files: Vec<PathBuf> = std::fs::read_dir(dir.join("cases"))
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    case_files.sort();
    assert!(!case_files.is_empty(), "no parity cases found");

    for file in case_files {
        let case: Case =
            serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        // Convention: a case source node's `sourcePath` (and a text
        // node's `rasterPath`) names a file in the parity dir (harness
        // mirrors it); source default = source.png.
        let mut sources = HashMap::new();
        for n in case.graph.nodes.iter().filter(|n| n.kind == "source") {
            let img = match n.source_path.as_deref() {
                Some(file) => image::open(dir.join(file))
                    .unwrap_or_else(|e| panic!("{}: {file}: {e}", case.name))
                    .to_rgba8(),
                None => source.clone(),
            };
            sources.insert(n.id.clone(), img);
        }
        let mut rasters = HashMap::new();
        for n in case.graph.nodes.iter().filter(|n| n.kind == "text") {
            let file = n
                .raster_path
                .as_deref()
                .unwrap_or_else(|| panic!("{}: text node {} without rasterPath", case.name, n.id));
            let img = image::open(dir.join(file))
                .unwrap_or_else(|e| panic!("{}: {file}: {e}", case.name))
                .to_rgba8();
            rasters.insert(n.id.clone(), img);
        }
        let tails = engine
            .render_chain(&case.graph, &sources, &rasters, &effects)
            .unwrap_or_else(|e| panic!("{}: {e}", case.name));
        let outputs: Vec<_> = case
            .graph
            .nodes
            .iter()
            .filter(|n| n.kind == "output")
            .collect();
        for out in &outputs {
            let s = output_settings_for(&case.graph, &out.id);
            let page = place_fit(
                &tails[&out.id],
                s.px.0,
                s.px.1,
                fit_mode_for(&case.graph, &out.id),
            );
            assert!(
                page.pixels().any(|p| p[0] > 8 || p[1] > 8 || p[2] > 8),
                "{}/{} golden looks black — eyeball before committing",
                case.name,
                s.name
            );
            let file_name = if outputs.len() == 1 {
                format!("{}.png", case.name)
            } else {
                format!("{}-{}.png", case.name, s.name)
            };
            let path = goldens.join(file_name);
            page.save(&path).unwrap();
            println!("golden written: {}", path.display());
        }
    }
}
