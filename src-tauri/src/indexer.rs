//! Font file indexer: parse TTF/OTF metadata and scan directories.

use std::path::{Path, PathBuf};
use ttf_parser::{name_id, Face};

/// Metadata extracted from a single font file.
pub struct FontMeta {
    pub family: String,
    pub style: String,
    pub ps_name: Option<String>,
    pub glyph_count: u16,
    pub format: String,
    pub hash: String,
}

/// First unicode name-table entry with the given name ID.
fn name(face: &Face, id: u16) -> Option<String> {
    face.names()
        .into_iter()
        .filter(|n| n.name_id == id && n.is_unicode())
        .find_map(|n| n.to_string())
}

/// Parse a font file into `FontMeta`. Errors on unreadable or corrupt files.
pub fn parse_font(path: &Path) -> Result<FontMeta, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let face = Face::parse(&data, 0).map_err(|e| e.to_string())?;
    let family = name(&face, name_id::TYPOGRAPHIC_FAMILY)
        .or_else(|| name(&face, name_id::FAMILY))
        .ok_or("no family name")?;
    let style = name(&face, name_id::TYPOGRAPHIC_SUBFAMILY)
        .or_else(|| name(&face, name_id::SUBFAMILY))
        .unwrap_or_else(|| "Regular".into());
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    Ok(FontMeta {
        family,
        style,
        ps_name: name(&face, name_id::POST_SCRIPT_NAME),
        glyph_count: face.number_of_glyphs(),
        format: if ext == "otf" { "otf".into() } else { "ttf".into() },
        hash: format!("{:x}", md5::compute(&data)),
    })
}

/// Recursively scan `dir` for .ttf/.otf files. When `is_system` is true,
/// Noto fonts (by filename prefix or parsed family) are filtered out.
pub fn scan_dir(dir: &Path, is_system: bool) -> Vec<(PathBuf, Result<FontMeta, String>)> {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            matches!(
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|s| s.to_lowercase())
                    .as_deref(),
                Some("ttf") | Some("otf")
            )
        })
        .map(|e| {
            let p = e.into_path();
            let m = parse_font(&p);
            (p, m)
        })
        .filter(|(p, m)| {
            !(is_system
                && (p
                    .file_name()
                    .and_then(|f| f.to_str())
                    .map_or(false, |f| f.starts_with("Noto"))
                    || matches!(m, Ok(meta) if meta.family.starts_with("Noto"))))
        })
        .collect()
}
