//! Golden writer for the preview/export parity harness (Task 15).
//! Ignored by default — run it to (re)generate the committed goldens:
//!
//!     cargo test --test parity_goldens -- --ignored
//!
//! Renders each effect (default params, seed 0) over the shared source
//! image at 512x731 through the wgpu engine into
//! test/parity/goldens/<id>.png. `npm run parity` renders the same
//! graphs through the WebGL2 preview executor and diffs against these.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

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

#[test]
#[ignore = "writes test/parity/goldens; pre-release, see RELEASING.md"]
fn write_goldens() {
    let mut engine = panopus_lib::render::engine::RenderEngine::new().expect("GPU required");
    let shaders = Path::new(env!("CARGO_MANIFEST_DIR")).join("../shaders");
    let effects = panopus_lib::render::manifest::load_effects(&shaders).unwrap();
    let dir = parity_dir();
    let source = ensure_source(&dir.join("source.png"));
    let goldens = dir.join("goldens");
    std::fs::create_dir_all(&goldens).unwrap();

    for id in ["dither", "vhs", "jpeg", "mix"] {
        let graph: FinishGraphRs = serde_json::from_str(&format!(
            r#"{{"v":1,"nodes":[
                {{"id":"src","kind":"source","x":0,"y":0}},
                {{"id":"e","kind":"effect","effectId":"{id}","x":0,"y":0}},
                {{"id":"out","kind":"output","x":0,"y":0}}],
            "wires":[
                {{"from":"src","to":"e","toIn":0}},
                {{"from":"e","to":"out","toIn":0}}]}}"#
        ))
        .unwrap();
        let mut sources = HashMap::new();
        sources.insert("src".to_string(), source.clone());
        let out = engine
            .render_graph(&graph, &sources, &effects, W, H)
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        assert!(
            out.pixels().any(|p| p[0] > 8 || p[1] > 8 || p[2] > 8),
            "{id} golden looks black — eyeball before committing"
        );
        let path = goldens.join(format!("{id}.png"));
        out.save(&path).unwrap();
        println!("golden written: {}", path.display());
    }
}
