//! Font file indexer: parse TTF/OTF metadata, scan directories, and
//! upsert results into the fonts table.

use std::path::{Path, PathBuf};
use ttf_parser::{name_id, Face, PlatformId};

/// Result of a full index run.
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct IndexReport {
    pub indexed: u32,
    pub quarantined: u32,
    pub removed: u32,
}

/// Metadata extracted from a single font file.
pub struct FontMeta {
    pub family: String,
    pub style: String,
    pub ps_name: Option<String>,
    pub glyph_count: u16,
    pub format: String,
    pub hash: String,
    /// Specimen fallback: for fonts mapping no Latin letters (neither 'A'
    /// nor 'a'), a short string of codepoints the font ACTUALLY maps so the
    /// grid's proof line doesn't render blank. None = Latin is covered.
    pub sample_text: Option<String>,
}

/// First unicode name-table entry with the given name ID.
fn name(face: &Face, id: u16) -> Option<String> {
    face.names()
        .into_iter()
        .filter(|n| n.name_id == id && n.is_unicode())
        .find_map(|n| n.to_string())
}

/// How many mapped codepoints a specimen sample keeps. ~24 characters
/// fill a grid card line at the default proof size without overflowing.
const SAMPLE_LEN: usize = 24;

/// How many candidate codepoints the collection passes gather before the
/// letters-first selection. System faces map dozens of Latin punctuation
/// marks and digits BEFORE their actual script blocks (Arabic U+0600+,
/// Armenian U+0531+, ...), so the window must reach well past them for the
/// specimen to lead with letters instead of `!"'()./:`.
const CANDIDATE_LEN: usize = 160;

/// A codepoint usable in a specimen: >= U+0021, a valid scalar value
/// (`char::from_u32` already rejects the surrogate range), and not
/// whitespace/control. PUA characters (e.g. U+F020–F0FF from symbol-encoded
/// dingbat cmaps) pass — WebKit renders them through the same cmap.
fn sampleable_char(cp: u32) -> Option<char> {
    if cp < 0x21 {
        return None;
    }
    let ch = char::from_u32(cp)?;
    if ch.is_whitespace() || ch.is_control() {
        return None;
    }
    Some(ch)
}

/// Collect up to `CANDIDATE_LEN` distinct sampleable codepoints mapped to a
/// real glyph by `subtable` into `seen`/`candidates`. Subtable-level
/// `glyph_index` is used on purpose: `Face::glyph_index` only consults
/// Unicode subtables, which would reject every symbol-encoded codepoint,
/// and `Subtable::codepoints` may list codepoints whose glyph is 0.
fn collect_specimen(
    subtable: &ttf_parser::cmap::Subtable,
    seen: &mut std::collections::BTreeSet<u32>,
    candidates: &mut Vec<char>,
) {
    subtable.codepoints(|cp| {
        if seen.len() >= CANDIDATE_LEN {
            return;
        }
        let Some(ch) = sampleable_char(cp) else { return };
        if subtable.glyph_index(cp).is_none() {
            return;
        }
        if seen.insert(cp) {
            candidates.push(ch);
        }
    });
}

/// Letters-first selection: keep alphabetic candidates in order, then pad
/// with the non-alphabetic ones, capped at `SAMPLE_LEN`. Symbol/dingbat
/// fonts (all-PUA, nothing alphabetic) are unaffected.
fn pick_sample(candidates: &[char]) -> String {
    let letters = candidates.iter().filter(|c| c.is_alphabetic());
    let rest = candidates.iter().filter(|c| !c.is_alphabetic());
    letters.chain(rest).take(SAMPLE_LEN).collect()
}

/// Build the specimen fallback for a face that maps no Latin letters.
///
/// Returns None when the face covers Latin ('A' or 'a' has a glyph) — the
/// normal case, where the proof text renders fine. Otherwise collects the
/// first `SAMPLE_LEN` distinct mapped visible codepoints, in two passes:
///
/// 1. Unicode cmap subtables (Arabic/Hebrew system faces and friends);
/// 2. only if pass 1 found nothing: symbol-encoded subtables (Windows
///    platform 3, encoding 0) — legacy dingbat/pi fonts map their glyphs
///    at U+F020–F0FF in the PUA there and have no Unicode subtable at
///    all, so pass 1 alone would leave them blank.
fn latin_sample(face: &Face) -> Option<String> {
    if face.glyph_index('A').is_some() || face.glyph_index('a').is_some() {
        return None;
    }
    let cmap = face.tables().cmap?;
    let mut seen = std::collections::BTreeSet::new();
    let mut candidates = Vec::new();
    for subtable in cmap.subtables {
        if !subtable.is_unicode() {
            continue;
        }
        collect_specimen(&subtable, &mut seen, &mut candidates);
        if seen.len() >= CANDIDATE_LEN {
            break;
        }
    }
    if candidates.is_empty() {
        for subtable in cmap.subtables {
            if !(subtable.platform_id == PlatformId::Windows && subtable.encoding_id == 0) {
                continue;
            }
            collect_specimen(&subtable, &mut seen, &mut candidates);
            if seen.len() >= CANDIDATE_LEN {
                break;
            }
        }
    }
    let sample = pick_sample(&candidates);
    if sample.is_empty() {
        None
    } else {
        Some(sample)
    }
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
        sample_text: latin_sample(&face),
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

/// Source name for a library font = first path component under the library
/// root (e.g. `opti`). Files sitting directly in the root fall back to
/// `library`.
fn library_source(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .ok()
        .and_then(|rel| {
            let mut comps = rel.components();
            let first = comps.next()?;
            // Only a directory component counts; a lone component is the
            // filename itself (file directly under the root).
            comps.next()?;
            Some(first.as_os_str().to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| "library".to_string())
}

/// Upsert one scanned file into `fonts`, counting real inserts/updates in
/// `report`. Unknown sources are created on the fly ('rights unclear') so
/// the fonts JOIN never orphans.
fn upsert_one(
    conn: &rusqlite::Connection,
    path: &Path,
    meta: &Result<FontMeta, String>,
    source: &str,
    is_system: bool,
    report: &mut IndexReport,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO sources (name, licence_status) VALUES (?1, 'rights unclear')",
        [source],
    )
    .map_err(|e| e.to_string())?;
    let path_s = path.to_string_lossy();
    match meta {
        Ok(m) => {
            // Hash-guarded upsert: unchanged files touch nothing (indexed
            // stays incremental) and existing rows keep active/favorite.
            // The sample_text IS NOT clause lets rows indexed before
            // migration v4 backfill their specimen on the next run (their
            // hashes are unchanged); once written it never fires again.
            let changed = conn
                .execute(
                    "INSERT INTO fonts (path, family, style, ps_name, source, format, glyph_count, hash, is_system, quarantined, sample_text)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)
                     ON CONFLICT(path) DO UPDATE SET
                       family = excluded.family, style = excluded.style,
                       ps_name = excluded.ps_name, glyph_count = excluded.glyph_count,
                       hash = excluded.hash, quarantined = excluded.quarantined,
                       sample_text = excluded.sample_text
                     WHERE fonts.hash != excluded.hash
                        OR fonts.sample_text IS NOT excluded.sample_text",
                    rusqlite::params![
                        path_s,
                        m.family,
                        m.style,
                        m.ps_name,
                        source,
                        m.format,
                        m.glyph_count,
                        m.hash,
                        is_system as i64,
                        m.sample_text
                    ],
                )
                .map_err(|e| e.to_string())?;
            report.indexed += changed as u32;
        }
        Err(_) => {
            let family = path
                .file_name()
                .map(|f| f.to_string_lossy().into_owned())
                .unwrap_or_else(|| path_s.clone().into_owned());
            let format = if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("otf"))
                .unwrap_or(false)
            {
                "otf"
            } else {
                "ttf"
            };
            let changed = conn
                .execute(
                    "INSERT INTO fonts (path, family, style, ps_name, source, format, glyph_count, hash, is_system, quarantined)
                     VALUES (?1, ?2, 'Regular', NULL, ?3, ?4, 0, '', ?5, 1)
                     ON CONFLICT(path) DO NOTHING",
                    rusqlite::params![path_s, family, source, format, is_system as i64],
                )
                .map_err(|e| e.to_string())?;
            report.quarantined += changed as u32;
        }
    }
    Ok(())
}

/// Index the library root and any system dirs into `fonts`, all inside one
/// transaction. Library rows whose files vanished are removed; system rows
/// are never deleted here.
pub fn index_all(
    conn: &rusqlite::Connection,
    library_root: &Path,
    system_dirs: &[PathBuf],
) -> Result<IndexReport, String> {
    // A missing/unmounted root scans as empty (walkdir errors are swallowed)
    // and the stale-row DELETE below would then wipe every library row,
    // cascading font_tags and losing favorites. Refuse before any DB write.
    if !library_root.is_dir() {
        return Err(format!("library root not found: {}", library_root.display()));
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut report = IndexReport::default();

    // Track scanned library paths in a temp table so the stale-row DELETE
    // never hits SQLite's bind-parameter limit on large libraries.
    tx.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS scanned_paths (path TEXT PRIMARY KEY);
         DELETE FROM scanned_paths;",
    )
    .map_err(|e| e.to_string())?;

    for (path, meta) in scan_dir(library_root, false) {
        let source = library_source(library_root, &path);
        upsert_one(&tx, &path, &meta, &source, false, &mut report)?;
        tx.execute(
            "INSERT OR IGNORE INTO scanned_paths (path) VALUES (?1)",
            [path.to_string_lossy()],
        )
        .map_err(|e| e.to_string())?;
    }

    for dir in system_dirs {
        for (path, meta) in scan_dir(dir, true) {
            upsert_one(&tx, &path, &meta, "system", true, &mut report)?;
        }
    }

    let removed = tx
        .execute(
            "DELETE FROM fonts WHERE is_system = 0 AND path NOT IN (SELECT path FROM scanned_paths)",
            [],
        )
        .map_err(|e| e.to_string())?;
    report.removed = removed as u32;

    tx.execute_batch("DROP TABLE IF EXISTS temp.scanned_paths")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::{pick_sample, sampleable_char};

    #[test]
    fn pick_sample_prefers_letters_over_punctuation() {
        let candidates: Vec<char> = "!\"'()./:«°»ابجد".chars().collect();
        let s = pick_sample(&candidates);
        assert!(s.starts_with("ابجد"), "letters must lead: {s}");
        assert!(s.contains('!'), "punctuation pads after letters");

        // All-PUA dingbat candidates are untouched by the preference.
        let pua: Vec<char> = ['\u{F021}', '\u{F022}'].into();
        assert_eq!(pick_sample(&pua), "\u{F021}\u{F022}");
    }

    #[test]
    fn sampleable_char_accepts_pua_and_rejects_invisibles() {
        // Symbol-encoded dingbat cmaps map glyphs at U+F020–F0FF (PUA):
        // these MUST pass or the fallback pass collects nothing.
        assert_eq!(sampleable_char(0xF021), Some('\u{F021}'));
        assert_eq!(sampleable_char(0xF0FF), Some('\u{F0FF}'));
        // Ordinary visible characters pass too.
        assert_eq!(sampleable_char(0x21), Some('!'));
        assert_eq!(sampleable_char(0x5D0), Some('א'));
        // Below U+0021: controls and space.
        assert_eq!(sampleable_char(0x00), None);
        assert_eq!(sampleable_char(0x20), None);
        // Surrogates are not scalar values (char::from_u32 rejects them).
        assert_eq!(sampleable_char(0xD800), None);
        // Visible-range exclusions: whitespace and control past U+0021.
        assert_eq!(sampleable_char(0x00A0), None, "no-break space");
        assert_eq!(sampleable_char(0x2028), None, "line separator");
        assert_eq!(sampleable_char(0x009F), None, "C1 control");
    }
}

/// Expand a leading `~` (bare or `~/…`) to the current user's home dir.
pub fn expand_tilde(p: &str) -> PathBuf {
    if p == "~" || p.starts_with("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(p.trim_start_matches('~').trim_start_matches('/'));
        }
    }
    PathBuf::from(p)
}

/// Full index against the app DB: opens the same DB file the SQL plugin
/// uses (app data dir + active DB name), reads `library_path` from
/// settings (expanding `~`), and indexes it plus the macOS system font
/// dirs. Shared by the `index_library` command and the library watcher.
pub fn run_full_index(app: &tauri::AppHandle) -> Result<IndexReport, String> {
    let conn = crate::open_app_db(app)?;

    let library_path: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'library_path'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to read library_path: {e}"))?;
    let library_root = expand_tilde(&library_path);

    let system_dirs = vec![
        PathBuf::from("/System/Library/Fonts"),
        PathBuf::from("/Library/Fonts"),
        expand_tilde("~/Library/Fonts"),
    ];

    index_all(&conn, &library_root, &system_dirs)
}
