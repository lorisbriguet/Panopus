//! Serde mirror of the effect manifests consumed by src/lib/effects.ts.
//! Both runtimes read the same shaders/<id>/effect.json files; the parity
//! harness (Task 15) guards against semantic drift between them.

use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct ParamSpec {
    pub name: String,
    /// "float" | "int" | "enum" | "bool" | "color"
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
    #[serde(default)]
    pub options: Option<Vec<String>>,
    pub default: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PassSpec {
    pub frag: String,
    #[serde(default)]
    pub textures: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EffectSpec {
    pub id: String,
    pub label: String,
    pub inputs: u32,
    pub passes: Vec<PassSpec>,
    pub params: Vec<ParamSpec>,
}

/// Load every shaders/<id>/effect.json under `dir`, keyed by effect id.
pub fn load_effects(dir: &Path) -> Result<HashMap<String, EffectSpec>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("shaders dir {}: {e}", dir.display()))?;
    let mut out = HashMap::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let manifest = entry.path().join("effect.json");
        if !manifest.is_file() {
            continue;
        }
        let text = std::fs::read_to_string(&manifest)
            .map_err(|e| format!("{}: {e}", manifest.display()))?;
        let spec: EffectSpec =
            serde_json::from_str(&text).map_err(|e| format!("{}: {e}", manifest.display()))?;
        out.insert(spec.id.clone(), spec);
    }
    Ok(out)
}
