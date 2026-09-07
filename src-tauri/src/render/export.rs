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

/// F4 poster at 300dpi (portrait).
pub const F4_PX: (u32, u32) = (10_571, 15_118);
pub const F4_MM: (f32, f32) = (895.0, 1280.0);

pub fn encode_png(img: &RgbaImage, path: &Path) -> Result<(), String> {
    img.save_with_format(path, image::ImageFormat::Png)
        .map_err(|e| format!("png {}: {e}", path.display()))
}

pub fn encode_tiff(img: &RgbaImage, path: &Path) -> Result<(), String> {
    let err = |e: &dyn std::fmt::Display| format!("tiff {}: {e}", path.display());
    let file = std::fs::File::create(path).map_err(|e| err(&e))?;
    let mut enc = tiff::encoder::TiffEncoder::new(std::io::BufWriter::new(file))
        .map_err(|e| err(&e))?;
    enc.write_image_with_compression::<tiff::encoder::colortype::RGBA8, _>(
        img.width(),
        img.height(),
        tiff::encoder::compression::Deflate::default(),
        img.as_raw(),
    )
    .map_err(|e| err(&e))
}

/// Page is exactly w_mm x h_mm; the image is scaled to cover it edge to
/// edge on both axes (alpha dropped — print has no transparency).
pub fn encode_pdf(img: &RgbaImage, path: &Path, w_mm: f32, h_mm: f32) -> Result<(), String> {
    use printpdf::{ColorBits, ColorSpace, ImageTransform, ImageXObject, Mm, PdfDocument, Px};

    let (w, h) = img.dimensions();
    let rgb: Vec<u8> = img.pixels().flat_map(|p| [p[0], p[1], p[2]]).collect();
    let (doc, page, layer) = PdfDocument::new("Panopus Finish", Mm(w_mm), Mm(h_mm), "artwork");
    let xobj = ImageXObject {
        width: Px(w as usize),
        height: Px(h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: false,
        image_data: rgb,
        image_filter: None,
        smask: None,
        clipping_bbox: None,
    };
    // At dpi d the image spans (px * 72 / d) pt; scale each axis so it
    // exactly fills the page (page pt = mm * 72 / 25.4).
    const DPI: f32 = 300.0;
    let scale_x = (w_mm * 72.0 / 25.4) / (w as f32 * 72.0 / DPI);
    let scale_y = (h_mm * 72.0 / 25.4) / (h as f32 * 72.0 / DPI);
    printpdf::Image::from(xobj).add_to_layer(
        doc.get_page(page).get_layer(layer),
        ImageTransform {
            dpi: Some(DPI),
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
    let mut engine = RenderEngine::new()?;
    engine.shader_root = shader_root;
    let mut sources: HashMap<String, RgbaImage> = HashMap::new();
    for node in graph.nodes.iter().filter(|n| n.kind == "source") {
        sources.insert(node.id.clone(), artwork.clone());
    }
    let out = engine.render_graph(&graph, &sources, &effects, F4_PX.0, F4_PX.1)?;
    emit_progress(&app, "render", 50);

    // "<name>-f4-300dpi.<ext>", name made path-safe.
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
            let path = Path::new(&dest_dir).join(format!("{base}-f4-300dpi.{ext}"));
            match ext {
                "png" => encode_png(&out, &path)?,
                "tiff" => encode_tiff(&out, &path)?,
                "pdf" => encode_pdf(&out, &path, F4_MM.0, F4_MM.1)?,
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
