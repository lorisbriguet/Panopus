//! Finish render engine: the Rust twin of the webview's WebGL2 executor.
//! Shares the shaders/ effect folders with the frontend; the parity
//! harness (Task 15) pins both to the same pixels.

pub mod engine;
pub mod export;
pub mod manifest;

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// Dev builds read the repo's shaders/ next to src-tauri; bundled builds
/// read the Tauri resource dir (tauri.conf.json bundle.resources).
pub fn shaders_dir(app: Option<&tauri::AppHandle>) -> PathBuf {
    if let Some(app) = app {
        use tauri::Manager;
        if let Ok(dir) = app
            .path()
            .resolve("shaders", tauri::path::BaseDirectory::Resource)
        {
            if dir.is_dir() {
                return dir;
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../shaders")
}

// Serde mirror of src/lib/finishGraph.ts's FinishGraph (graph JSON v1).
// Unknown fields (fromOut, future additions) are ignored by serde.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNodeRs {
    pub id: String,
    /// "source" | "effect" | "output"
    pub kind: String,
    #[serde(rename = "effectId", default)]
    pub effect_id: Option<String>,
    #[serde(default)]
    pub params: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(rename = "sourcePath", default)]
    pub source_path: Option<String>,
    /// Text nodes (D3): cached raster file the exporter composites.
    #[serde(rename = "rasterPath", default)]
    pub raster_path: Option<String>,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphWireRs {
    pub from: String,
    pub to: String,
    #[serde(rename = "toIn")]
    pub to_in: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinishGraphRs {
    pub v: u32,
    pub nodes: Vec<GraphNodeRs>,
    pub wires: Vec<GraphWireRs>,
}

/// Per-node render resolution — mirror of finishGraph.ts's
/// nodeResolutions (D2: resolution is a chain property). Sources start
/// at their native size (aspect-preserving cap); scale nodes change it
/// (factor 0.05–4, or absolute width+height when BOTH set); every other
/// node inherits its FIRST input (toIn 0); unwired inputs fall back to
/// 8x8. Keep rounding/clamps in lockstep with the TS side.
pub fn node_resolutions(
    g: &FinishGraphRs,
    source_dims: &HashMap<String, (u32, u32)>,
    cap: u32,
) -> HashMap<String, (u32, u32)> {
    let mut res: HashMap<String, (u32, u32)> = HashMap::new();
    let clamp_axis = |v: f64| -> u32 { (v.round() as i64).clamp(1, i64::from(cap)) as u32 };
    for id in execution_order(g) {
        let Some(node) = g.nodes.iter().find(|n| n.id == id) else {
            continue;
        };
        let input_res = |res: &HashMap<String, (u32, u32)>| -> (u32, u32) {
            g.wires
                .iter()
                .find(|w| w.to == id && w.to_in == 0)
                .and_then(|w| res.get(&w.from).copied())
                .unwrap_or((8, 8))
        };
        let r = match node.kind.as_str() {
            "source" => {
                let (dw, dh) = source_dims.get(&id).copied().unwrap_or((8, 8));
                let s = (f64::from(cap) / f64::from(dw.max(dh))).min(1.0);
                (clamp_axis(f64::from(dw) * s), clamp_axis(f64::from(dh) * s))
            }
            "scale" => {
                let p = node.params.as_ref();
                let abs = |k: &str| -> Option<f64> {
                    p.and_then(|m| m.get(k))
                        .and_then(|v| v.as_f64())
                        .filter(|n| n.is_finite() && *n > 0.0)
                };
                match (abs("width"), abs("height")) {
                    (Some(aw), Some(ah)) => (clamp_axis(aw), clamp_axis(ah)),
                    _ => {
                        let raw = p
                            .and_then(|m| m.get("factor"))
                            .and_then(|v| v.as_f64())
                            .filter(|n| n.is_finite())
                            .unwrap_or(0.5);
                        let f = raw.clamp(0.05, 4.0);
                        let (iw, ih) = input_res(&res);
                        (clamp_axis(f64::from(iw) * f), clamp_axis(f64::from(ih) * f))
                    }
                }
            }
            _ => input_res(&res),
        };
        res.insert(id, r);
    }
    res
}

/// Port of finishGraph.ts's executionOrder: Kahn's algorithm over the
/// subgraph that reaches an output node. Semantics mirrored exactly —
/// including the deterministic tie-break: when several nodes are ready,
/// the one earliest in `g.nodes` runs first (nodes are scanned in input
/// order; HashMaps are only used for keyed lookup, never iterated).
pub fn execution_order(g: &FinishGraphRs) -> Vec<String> {
    // Reverse reachability from the output node(s).
    let mut prev: HashMap<&str, Vec<&str>> = g
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), Vec::new()))
        .collect();
    for w in &g.wires {
        if let Some(v) = prev.get_mut(w.to.as_str()) {
            v.push(w.from.as_str());
        }
    }
    let mut stack: Vec<&str> = g
        .nodes
        .iter()
        .filter(|n| n.kind == "output")
        .map(|n| n.id.as_str())
        .collect();
    let mut reaches: HashSet<&str> = stack.iter().copied().collect();
    while let Some(id) = stack.pop() {
        if let Some(ps) = prev.get(id) {
            for p in ps {
                if reaches.insert(p) {
                    stack.push(p);
                }
            }
        }
    }

    let mut indegree: HashMap<&str, i64> = g
        .nodes
        .iter()
        .filter(|n| reaches.contains(n.id.as_str()))
        .map(|n| (n.id.as_str(), 0))
        .collect();
    for w in &g.wires {
        if reaches.contains(w.from.as_str()) && reaches.contains(w.to.as_str()) {
            if let Some(d) = indegree.get_mut(w.to.as_str()) {
                *d += 1;
            }
        }
    }
    let mut order: Vec<String> = Vec::new();
    let mut done: HashSet<&str> = HashSet::new();
    loop {
        let Some(ready) = g
            .nodes
            .iter()
            .find(|n| indegree.get(n.id.as_str()) == Some(&0) && !done.contains(n.id.as_str()))
        else {
            break;
        };
        done.insert(ready.id.as_str());
        order.push(ready.id.clone());
        for w in &g.wires {
            if w.from == ready.id {
                if let Some(d) = indegree.get_mut(w.to.as_str()) {
                    *d -= 1;
                }
            }
        }
    }
    order
}
