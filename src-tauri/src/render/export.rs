//! export_finish: render a project's Finish graph at F4/300dpi via the
//! wgpu engine and encode the result as PNG / TIFF (deflate) / PDF
//! (full-bleed 895x1280mm page).
//!
//! PDF note: printpdf 0.7 flate-compresses image streams only in release
//! builds (debug builds skip compression for speed) — a debug-run export
//! produces a working but huge PDF.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use image::RgbaImage;
use tauri::Emitter;

use super::engine::RenderEngine;
use super::{manifest, shaders_dir, FinishGraphRs};

/// F4 poster at 300dpi (portrait) — the DEFAULT output when the graph's
/// output node carries no settings.
pub const F4_PX: (u32, u32) = (10_571, 15_118);
pub const F4_MM: (f32, f32) = (895.0, 1280.0);

/// Output node settings, resolved to concrete render/page numbers.
/// Mirror of src/lib/finishGraph.ts's outputSettings/outputPx/outputMm —
/// keep clamps and rounding in lockstep.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OutputSettingsRs {
    pub px: (u32, u32),
    pub mm: (f32, f32),
    pub dpi: u32,
    /// TIFF/PDF encode DeviceCMYK (naive conversion); PNG stays RGB.
    pub cmyk: bool,
}

pub fn output_settings(graph: &FinishGraphRs) -> OutputSettingsRs {
    let p = graph
        .nodes
        .iter()
        .find(|n| n.kind == "output")
        .and_then(|n| n.params.as_ref());
    let get = |k: &str| p.and_then(|m| m.get(k));
    let num = |k: &str, def: f64, min: f64, max: f64| {
        get(k)
            .and_then(|v| v.as_f64())
            .filter(|n| n.is_finite())
            .unwrap_or(def)
            .clamp(min, max)
    };
    let unit_px = get("unit").and_then(|v| v.as_str()) == Some("px");
    let dpi = num("dpi", 300.0, 36.0, 1200.0).round();
    let (w, h) = if unit_px {
        (
            num("width", f64::from(F4_PX.0), 16.0, 16384.0).round(),
            num("height", f64::from(F4_PX.1), 16.0, 16384.0).round(),
        )
    } else {
        (
            num("width", f64::from(F4_MM.0), 10.0, 5000.0),
            num("height", f64::from(F4_MM.1), 10.0, 5000.0),
        )
    };
    let to_px = |v: f64| -> u32 {
        let px = if unit_px { v } else { (v / 25.4 * dpi).round() };
        px.min(16384.0) as u32
    };
    let to_mm = |v: f64| -> f32 {
        (if unit_px { v / dpi * 25.4 } else { v }) as f32
    };
    OutputSettingsRs {
        px: (to_px(w), to_px(h)),
        mm: (to_mm(w), to_mm(h)),
        dpi: dpi as u32,
        cmyk: get("color").and_then(|v| v.as_str()) == Some("cmyk"),
    }
}

/// Naive device conversion (K = 1 - max(RGB)) — declared-intent CMYK,
/// not color-managed.
fn rgba_to_cmyk(img: &RgbaImage) -> Vec<u8> {
    let mut out = Vec::with_capacity((img.width() * img.height() * 4) as usize);
    for p in img.pixels() {
        let r = f32::from(p[0]) / 255.0;
        let g = f32::from(p[1]) / 255.0;
        let b = f32::from(p[2]) / 255.0;
        let k = 1.0 - r.max(g).max(b);
        let (c, m, y) = if k >= 1.0 {
            (0.0, 0.0, 0.0)
        } else {
            (
                (1.0 - r - k) / (1.0 - k),
                (1.0 - g - k) / (1.0 - k),
                (1.0 - b - k) / (1.0 - k),
            )
        };
        out.extend_from_slice(&[
            (c * 255.0).round() as u8,
            (m * 255.0).round() as u8,
            (y * 255.0).round() as u8,
            (k * 255.0).round() as u8,
        ]);
    }
    out
}

pub fn encode_png(img: &RgbaImage, path: &Path) -> Result<(), String> {
    img.save_with_format(path, image::ImageFormat::Png)
        .map_err(|e| format!("png {}: {e}", path.display()))
}

pub fn encode_tiff(img: &RgbaImage, path: &Path, cmyk: bool) -> Result<(), String> {
    let err = |e: &dyn std::fmt::Display| format!("tiff {}: {e}", path.display());
    let file = std::fs::File::create(path).map_err(|e| err(&e))?;
    let mut enc = tiff::encoder::TiffEncoder::new(std::io::BufWriter::new(file))
        .map_err(|e| err(&e))?;
    if cmyk {
        enc.write_image_with_compression::<tiff::encoder::colortype::CMYK8, _>(
            img.width(),
            img.height(),
            tiff::encoder::compression::Deflate::default(),
            &rgba_to_cmyk(img),
        )
        .map_err(|e| err(&e))
    } else {
        enc.write_image_with_compression::<tiff::encoder::colortype::RGBA8, _>(
            img.width(),
            img.height(),
            tiff::encoder::compression::Deflate::default(),
            img.as_raw(),
        )
        .map_err(|e| err(&e))
    }
}

/// Page is exactly w_mm x h_mm; the image is scaled to cover it edge to
/// edge on both axes (alpha dropped — print has no transparency).
pub fn encode_pdf(
    img: &RgbaImage,
    path: &Path,
    w_mm: f32,
    h_mm: f32,
    dpi: f32,
    cmyk: bool,
) -> Result<(), String> {
    use printpdf::{ColorBits, ColorSpace, ImageTransform, ImageXObject, Mm, PdfDocument, Px};

    let (w, h) = img.dimensions();
    let (color_space, data) = if cmyk {
        (ColorSpace::Cmyk, rgba_to_cmyk(img))
    } else {
        (
            ColorSpace::Rgb,
            img.pixels().flat_map(|p| [p[0], p[1], p[2]]).collect(),
        )
    };
    let (doc, page, layer) = PdfDocument::new("Panopus Finish", Mm(w_mm), Mm(h_mm), "artwork");
    let xobj = ImageXObject {
        width: Px(w as usize),
        height: Px(h as usize),
        color_space,
        bits_per_component: ColorBits::Bit8,
        interpolate: false,
        image_data: data,
        image_filter: None,
        smask: None,
        clipping_bbox: None,
    };
    // At dpi d the image spans (px * 72 / d) pt; scale each axis so it
    // exactly fills the page (page pt = mm * 72 / 25.4).
    let scale_x = (w_mm * 72.0 / 25.4) / (w as f32 * 72.0 / dpi);
    let scale_y = (h_mm * 72.0 / 25.4) / (h as f32 * 72.0 / dpi);
    printpdf::Image::from(xobj).add_to_layer(
        doc.get_page(page).get_layer(layer),
        ImageTransform {
            dpi: Some(dpi),
            scale_x: Some(scale_x),
            scale_y: Some(scale_y),
            ..Default::default()
        },
    );
    let file = std::fs::File::create(path).map_err(|e| format!("pdf {}: {e}", path.display()))?;
    doc.save(&mut std::io::BufWriter::new(file))
        .map_err(|e| format!("pdf {}: {e}", path.display()))
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, pct: u8) {
    let _ = app.emit(
        "finish-export-progress",
        serde_json::json!({ "stage": stage, "pct": pct }),
    );
}

/// Render + encode, blocking. Written files are removed again on error.
fn run_export(
    app: tauri::AppHandle,
    name: String,
    artwork_path: String,
    graph_json: String,
    formats: Vec<String>,
    dest_dir: String,
    shader_root: PathBuf,
) -> Result<Vec<String>, String> {
    emit_progress(&app, "render", 0);
    let graph: FinishGraphRs = serde_json::from_str(&graph_json)
        .map_err(|e| format!("project has no valid finish graph: {e}"))?;
    let artwork = image::open(&artwork_path)
        .map_err(|e| format!("artwork {artwork_path}: {e}"))?
        .to_rgba8();
    let effects = manifest::load_effects(&shader_root)?;
    let settings = output_settings(&graph);
    let mut engine = RenderEngine::new()?;
    engine.shader_root = shader_root;
    let mut sources: HashMap<String, RgbaImage> = HashMap::new();
    for node in graph.nodes.iter().filter(|n| n.kind == "source") {
        sources.insert(node.id.clone(), artwork.clone());
    }
    let (out_w, out_h) = settings.px;
    let out = engine.render_graph(&graph, &sources, &effects, out_w, out_h)?;
    emit_progress(&app, "render", 50);

    // "<name>-<w>x<h>-<dpi>dpi.<ext>", name made path-safe.
    let safe: String = name
        .trim()
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':') { '-' } else { c })
        .collect();
    let base = if safe.is_empty() { "untitled".into() } else { safe };

    let mut written: Vec<String> = Vec::new();
    let per = 50 / formats.len().max(1) as u8;
    let result = (|| {
        for (i, format) in formats.iter().enumerate() {
            let ext = format.as_str();
            let path = Path::new(&dest_dir).join(format!(
                "{base}-{out_w}x{out_h}-{}dpi.{ext}",
                settings.dpi
            ));
            match ext {
                "png" => encode_png(&out, &path)?,
                "tiff" => encode_tiff(&out, &path, settings.cmyk)?,
                "pdf" => encode_pdf(
                    &out,
                    &path,
                    settings.mm.0,
                    settings.mm.1,
                    settings.dpi as f32,
                    settings.cmyk,
                )?,
                other => return Err(format!("unknown export format: {other}")),
            }
            written.push(path.to_string_lossy().into_owned());
            emit_progress(&app, ext, 50 + per * (i as u8 + 1));
        }
        Ok(())
    })();
    match result {
        Ok(()) => Ok(written),
        Err(e) => {
            for p in &written {
                let _ = std::fs::remove_file(p);
            }
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn export_finish(
    app: tauri::AppHandle,
    project_id: i64,
    formats: Vec<String>,
    dest_dir: String,
) -> Result<Vec<String>, String> {
    let (name, artwork_path, graph_json) = {
        let conn = crate::open_app_db(&app)?;
        conn.query_row(
            "SELECT name, artwork_path, graph_json FROM projects WHERE id = ?1",
            [project_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|e| format!("project {project_id}: {e}"))?
    };
    let artwork_path = artwork_path.ok_or("project has no artwork")?;
    let shader_root = shaders_dir(Some(&app));
    tauri::async_runtime::spawn_blocking(move || {
        run_export(
            app,
            name,
            artwork_path,
            graph_json,
            formats,
            dest_dir,
            shader_root,
        )
    })
    .await
    .map_err(|e| format!("export task: {e}"))?
}
