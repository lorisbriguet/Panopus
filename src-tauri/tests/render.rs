//! Render engine tests: manifest loading, graph execution order, and a
//! real wgpu render of the mix-passthrough graph (skips on GPU-less CI).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use panopus_lib::render::{execution_order, FinishGraphRs};

fn shaders_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../shaders")
}

#[test]
fn load_effects_finds_core_effects() {
    let effects = panopus_lib::render::manifest::load_effects(&shaders_dir()).unwrap();
    assert!(effects.len() >= 4, "expected >=4 effects, got {}", effects.len());
    for id in ["dither", "vhs", "jpeg", "mix"] {
        assert!(effects.contains_key(id), "missing effect {id}");
    }
    assert_eq!(effects["mix"].inputs, 2);
    assert_eq!(effects["vhs"].passes.len(), 2);
    assert_eq!(effects["jpeg"].passes.len(), 4);
    // enum defaults must be one of their options (mirrors the TS registry test)
    for spec in effects.values() {
        for p in &spec.params {
            if p.kind == "enum" {
                let opts = p.options.as_ref().expect("enum without options");
                let def = p.default.as_str().expect("enum default not a string");
                assert!(opts.iter().any(|o| o == def), "{}/{}", spec.id, p.name);
            }
        }
    }
}

#[test]
fn execution_order_mirrors_ts_semantics() {
    // Diamond: src -> a, src -> b, a -> m, b -> m, m -> out. Producers come
    // before consumers; ties resolve in node input order (a before b).
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"a","kind":"effect","effectId":"dither","x":0,"y":0},
            {"id":"b","kind":"effect","effectId":"jpeg","x":0,"y":0},
            {"id":"m","kind":"effect","effectId":"mix","x":0,"y":0},
            {"id":"orphan","kind":"effect","effectId":"vhs","x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"src","to":"a","toIn":0},
            {"from":"src","to":"b","toIn":0},
            {"from":"a","to":"m","toIn":0},
            {"from":"b","to":"m","toIn":1},
            {"from":"m","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let order = execution_order(&graph);
    assert_eq!(order, ["src", "a", "b", "m", "out"]);
}

#[test]
fn engine_renders_mix_passthrough() {
    let mut engine = match panopus_lib::render::engine::RenderEngine::new() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("skipping engine test: {e}");
            return;
        }
    };
    let effects = panopus_lib::render::manifest::load_effects(&shaders_dir()).unwrap();
    // source -> mix(amount=0) -> output: amount 0 must pass input A through
    // untouched (the mix.frag contract).
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"m","kind":"effect","effectId":"mix","params":{"amount":0},"x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"src","to":"m","toIn":0},
            {"from":"m","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let red = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 0, 255]));
    let mut sources = HashMap::new();
    sources.insert("src".to_string(), red);
    let out = engine
        .render_graph(&graph, &sources, &effects, 64, 92)
        .unwrap();
    assert_eq!(out.dimensions(), (64, 92));
    for (x, y) in [(0u32, 0u32), (32, 46), (63, 91)] {
        let p = out.get_pixel(x, y);
        assert!(
            p[0] > 250 && p[1] < 5 && p[2] < 5 && p[3] > 250,
            "expected red at ({x},{y}), got {p:?}"
        );
    }
}

#[test]
fn render_chain_returns_a_tail_per_output() {
    let mut engine = match panopus_lib::render::engine::RenderEngine::new() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("skipping engine test: {e}");
            return;
        }
    };
    let effects = panopus_lib::render::manifest::load_effects(&shaders_dir()).unwrap();
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"a","kind":"output","x":0,"y":0},
            {"id":"b","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"src","to":"a","toIn":0},
            {"from":"src","to":"b","toIn":0}]}"#,
    )
    .unwrap();
    let red = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 0, 255]));
    let mut sources = HashMap::new();
    sources.insert("src".to_string(), red);
    let tails = engine.render_chain(&graph, &sources, &effects).unwrap();
    assert_eq!(tails.len(), 2);
    for id in ["a", "b"] {
        let img = &tails[id];
        assert_eq!(img.dimensions(), (8, 8), "{id}");
        let p = img.get_pixel(4, 4);
        assert!(p[0] > 250 && p[1] < 5, "{id}: {p:?}");
    }
}

#[test]
fn node_resolutions_mirrors_ts() {
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"sc","kind":"scale","params":{"factor":0.5},"x":0,"y":0},
            {"id":"e","kind":"effect","effectId":"dither","x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"src","to":"sc","toIn":0},
            {"from":"sc","to":"e","toIn":0},
            {"from":"e","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let mut dims = HashMap::new();
    dims.insert("src".to_string(), (1000u32, 2000u32));
    // Identical numbers to the TS unit tests (finishGraph.test.ts).
    let res = panopus_lib::render::node_resolutions(&graph, &dims, 16384);
    assert_eq!(res["src"], (1000, 2000));
    assert_eq!(res["sc"], (500, 1000));
    assert_eq!(res["e"], (500, 1000));
    assert_eq!(res["out"], (500, 1000));
    let capped = panopus_lib::render::node_resolutions(&graph, &dims, 1024);
    assert_eq!(capped["src"], (512, 1024));
}

#[test]
fn scale_sandwich_renders_at_propagated_resolutions() {
    let mut engine = match panopus_lib::render::engine::RenderEngine::new() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("skipping engine test: {e}");
            return;
        }
    };
    let effects = panopus_lib::render::manifest::load_effects(&shaders_dir()).unwrap();
    // source(8x8 red) -> scale(x4, pixel) -> output: nearest upscale of a
    // solid color must stay solid; the tail arrives at 32x32.
    let graph: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"sc","kind":"scale","params":{"factor":4,"filter":"pixel"},"x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"src","to":"sc","toIn":0},
            {"from":"sc","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let red = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 0, 255]));
    let mut sources = HashMap::new();
    sources.insert("src".to_string(), red);
    let tails = engine.render_chain(&graph, &sources, &effects).unwrap();
    let tail = &tails["out"];
    assert_eq!(tail.dimensions(), (32, 32));
    for (x, y) in [(0u32, 0u32), (16, 16), (31, 31)] {
        let p = tail.get_pixel(x, y);
        assert!(p[0] > 250 && p[1] < 5 && p[2] < 5, "({x},{y}): {p:?}");
    }

    // down-then-up sandwich lands on the expected dimensions
    let graph2: FinishGraphRs = serde_json::from_str(
        r#"{"v":1,"nodes":[
            {"id":"src","kind":"source","x":0,"y":0},
            {"id":"a","kind":"scale","params":{"factor":0.25},"x":0,"y":0},
            {"id":"b","kind":"scale","params":{"factor":4},"x":0,"y":0},
            {"id":"out","kind":"output","x":0,"y":0}],
        "wires":[
            {"from":"src","to":"a","toIn":0},
            {"from":"a","to":"b","toIn":0},
            {"from":"b","to":"out","toIn":0}]}"#,
    )
    .unwrap();
    let red = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 0, 255]));
    let mut sources2 = HashMap::new();
    sources2.insert("src".to_string(), red);
    let tails2 = engine.render_chain(&graph2, &sources2, &effects).unwrap();
    assert_eq!(tails2["out"].dimensions(), (64, 64));
}
