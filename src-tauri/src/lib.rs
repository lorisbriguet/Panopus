pub mod activation;
mod bootstrap;
mod dbfiles;
pub mod indexer;
pub mod watcher;

use tauri::Manager;
use tauri_plugin_sql::Migration;
use serde_json::Value as JsonValue;
use std::sync::Mutex;

/// Panopus v1 initial schema migration
pub const MIGRATION_V1: &str = r#"
CREATE TABLE fonts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL, style TEXT NOT NULL DEFAULT 'Regular',
  ps_name TEXT, source TEXT NOT NULL,
  format TEXT NOT NULL, glyph_count INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  quarantined INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fonts_source ON fonts(source);
CREATE INDEX idx_fonts_family ON fonts(family);
CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT 'blue');
CREATE TABLE font_tags (font_id INTEGER NOT NULL REFERENCES fonts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (font_id, tag_id));
CREATE TABLE sources (name TEXT PRIMARY KEY, licence_status TEXT NOT NULL DEFAULT 'free', note TEXT);
INSERT INTO sources (name, licence_status) VALUES
 ('steffmann','free'),('im-fell','free'),('astigmatic','free'),('wiegel','free'),
 ('opti','rights unclear'),('bestofdafont','personal use'),('bitstream','commercial'),
 ('klein','donationware'),('nickcurtis','free'),('apostrophic','free'),('pape','free'),('system','free');
CREATE TABLE designers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  content_json TEXT NOT NULL DEFAULT '{}', links TEXT NOT NULL DEFAULT '[]');
CREATE TABLE designer_sources (designer_id INTEGER NOT NULL REFERENCES designers(id) ON DELETE CASCADE,
  source TEXT NOT NULL, PRIMARY KEY (designer_id, source));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings (key, value) VALUES
 ('library_path', '~/Documents/GitHub/panopus-library'),
 ('proof_text', 'Grand Hôtel du Chien Savant'), ('proof_size', '34');
"#;

/// Panopus v1 designer wiki seed (Task 13). Ten designers/foundries with
/// researched bios as Tiptap doc JSON and real source URLs; the
/// designer_sources rows map each wiki entry to its fonts.source value.
/// Sources: panopus-library LICENSING.md + scrape-log.md.
pub const MIGRATION_V2: &str = r#"
INSERT INTO designers (name, slug, content_json, links) VALUES
('Dieter Steffmann', 'steffmann',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Dieter Steffmann is a retired German typesetter from Kreuztal, trained in traditional letterpress composition before the trade moved to photo and then digital typesetting."}]},
   {"type":"paragraph","content":[{"type":"text","text":"In retirement he digitized several hundred historical typefaces, with a particular focus on blackletter and Fraktur styles, Victorian and Art Nouveau display faces, and other material from the German printing tradition. His Dafont catalogue accounts for the roughly two hundred files in this library."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Steffmann regards these typefaces as cultural heritage rather than commercial property: he grants free use of his digitizations, including commercial use."}]}
 ]}',
 '["https://www.dafont.com/dieter-steffmann.d253","http://www.moorstation.org/typoasis"]'),
('Manfred Klein', 'klein',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Manfred Klein (1932-2018) was a German typographer who trained as a typesetter in the 1950s and spent his career in advertising as a typographer and creative director, writing about type along the way."}]},
   {"type":"paragraph","content":[{"type":"text","text":"In retirement he became one of the most prolific hobbyist type designers of the early digital era, releasing thousands of fonts: experimental text faces, historical revivals and a vast body of playful dingbats. His work was hosted for years on the typOasis site and survives in large mirrored collections on Fontspace and Dafont."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Klein released his fonts as freeware; for commercial use he asked not for payment to himself but for a donation to charity."}]}
 ]}',
 '["https://www.fontspace.com/manfred-klein","https://www.dafont.com/manfred-klein.d302","http://www.moorstation.org/typoasis"]'),
('Dick Pape', 'pape',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Dick Pape is an American font digitizer who took up type digitization in retirement and produced work at a scale few professionals match: this library holds close to two thousand of his files."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Rather than drawing new letterforms, Pape revives material that would otherwise stay locked in books: nineteenth-century specimen alphabets, ornamental and pictorial initials, and decorative lettering from public-domain archival sources."}]},
   {"type":"paragraph","content":[{"type":"text","text":"His collections are distributed freely through Luc Devroye''s type archive, which hosts a dedicated mirror of his output; much of it digitizes public-domain nineteenth-century material."}]}
 ]}',
 '["https://luc.devroye.org/pape/","https://luc.devroye.org/"]'),
('Nick Curtis', 'nickcurtis',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Nick Curtis is an American type designer who came to type through a career in advertising and graphic design, publishing under the Nick''s Fonts label from the 1990s onward."}]},
   {"type":"paragraph","content":[{"type":"text","text":"His speciality is reviving vintage commercial lettering: sign painting, showcard and Art Deco styles, wood type, and lettering lifted from old advertisements and packaging, typically issued under punning names. The catalogue runs to hundreds of families."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Alongside commercial releases, Curtis published a large freeware set; the Fontspace mirror of that freeware collection is what this library holds."}]}
 ]}',
 '["https://www.fontspace.com/nicks-fonts","http://www.nicksfonts.com"]'),
('Igino Marini', 'im-fell',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Igino Marini is an Italian engineer best known for digitizing the Fell Types: the seventeenth-century punches and matrices acquired by Bishop John Fell for Oxford University Press."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Beginning in the 2000s, Marini produced digitizations that deliberately preserve the irregular, inked character of the original printing rather than smoothing it away. He is also the author of iKern, a mathematical letterfitting service used by many independent foundries for spacing and kerning."}]},
   {"type":"paragraph","content":[{"type":"text","text":"The Fell Types digitizations are free to use with attribution to Igino Marini, and are also distributed through Google Fonts."}]}
 ]}',
 '["https://iginomarini.com/fell/","https://fonts.google.com"]'),
('Peter Wiegel', 'wiegel',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Peter Wiegel is a German type designer who published his catalogue of well over three hundred fonts on his own site, peter-wiegel.de."}]},
   {"type":"paragraph","content":[{"type":"text","text":"His work centres on the German printing tradition: blackletter and Fraktur faces, Kurrent and other historical German scripts, and revivals of display material from old specimens, alongside original designs."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Wiegel released his fonts under open licences, chiefly the SIL Open Font License, so they are free to use commercially and to modify."}]}
 ]}',
 '["http://www.peter-wiegel.de/fonts2.html","http://www.peter-wiegel.de/Fonts/index.html"]'),
('Fredrick Nader (Apostrophic Labs)', 'apostrophic',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Apostrophic Laboratories was a type collective active around the turn of the millennium, led by Fredrick Nader, who worked under the alias Apostrophe."}]},
   {"type":"paragraph","content":[{"type":"text","text":"The Labs released hundreds of free families in a few intensely productive years: techno and display experiments, text faces and extensive dingbat sets, produced by Nader together with collaborators around the world."}]},
   {"type":"paragraph","content":[{"type":"text","text":"The fonts were released as freeware permitting free use but not modification or resale. After the original site went offline, the catalogue survived through archives such as Fontspace and Dafont."}]}
 ]}',
 '["https://www.fontspace.com/apostrophic-lab","https://www.dafont.com/apostrophic-labs.d128"]'),
('Castcraft / OPTI', 'opti',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Castcraft Software, publisher of the OPTIfonts library, was a Chicago type house rooted in the phototypesetting era. Under the OPTI prefix it digitized an enormous catalogue of display and text faces, including many designs that originated with phototype suppliers such as Filmotype, VGC and Alphabet Innovations."}]},
   {"type":"paragraph","content":[{"type":"text","text":"The company disappeared without transferring its rights, and many OPTI faces were themselves digitizations of other foundries'' designs, so there is no one left to licence the library from."}]},
   {"type":"paragraph","content":[{"type":"text","text":"The fonts now circulate as abandonware with no valid licence and their rights remain unclear. For published work, licensed equivalent revivals exist from foundries such as Canada Type and Photo-Lettering."}]}
 ]}',
 '["http://abfonts.freehostia.com/opti/","https://luc.devroye.org/fonts-27506.html"]'),
('Bitstream', 'bitstream',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Bitstream Inc., founded in 1981 in Cambridge, Massachusetts by Matthew Carter, Mike Parker and colleagues, was the first major independent digital type foundry, selling type as software unbundled from typesetting hardware."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Its library combined originals such as Carter''s Charter with versions of classic faces issued under Bitstream naming (Swiss 721, Dutch 801 and so on). Charter and Courier 10 Pitch were donated to the X Consortium in the early 1990s under permissive terms."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Monotype acquired Bitstream''s font business in 2012, and the library is licensed commercially through MyFonts. The files in this collection were format-shifted from a personal 1990 floppy archive for archival use and must not be redistributed."}]}
 ]}',
 '["https://en.wikipedia.org/wiki/Bitstream_Inc.","https://www.myfonts.com/pages/linotype-bitstream-foundry/"]'),
('Astigmatic (Brian J. Bonislawsky)', 'astigmatic',
 '{"type":"doc","content":[
   {"type":"paragraph","content":[{"type":"text","text":"Astigmatic, in full the Astigmatic One Eye Typographic Institute, is the foundry of American type designer Brian J. Bonislawsky, active since the mid-1990s."}]},
   {"type":"paragraph","content":[{"type":"text","text":"Its output is display-driven: Western and Victorian wood-type styles, grunge, novelty and sign-painting faces, produced in large numbers. A substantial set of Astigmatic families was later released as open source through Google Fonts, which is where this collection''s files come from."}]},
   {"type":"paragraph","content":[{"type":"text","text":"The Google Fonts releases are licensed under the SIL Open Font License or the Apache License and are free for commercial use."}]}
 ]}',
 '["https://fonts.google.com","http://www.astigmatic.com"]');
INSERT INTO designer_sources (designer_id, source) SELECT id, slug FROM designers;
"#;

/// Velvetyne is a libre foundry (SIL OFL 1.1); the indexer's default for
/// unknown sources is 'rights unclear', so seed/repair the row explicitly.
pub const MIGRATION_V3: &str = r#"
INSERT INTO sources (name, licence_status) VALUES ('velvetyne', 'free')
  ON CONFLICT(name) DO UPDATE SET licence_status = 'free';
"#;

/// Specimen fallback for fonts with no Latin letters (Arabic/Hebrew system
/// faces, dingbat collections): the indexer stores a short string of
/// codepoints the font ACTUALLY maps, and the grid renders it in place of
/// the proof text. NULL = font covers Latin, use the proof text.
pub const MIGRATION_V4: &str = r#"
ALTER TABLE fonts ADD COLUMN sample_text TEXT;
"#;

/// Purchased-foundry sources: `bought` = the studio holds a paid licence
/// (receipt/licence doc lives next to the fonts in the library folder).
/// errorerror = errorerror.studio, whose EE Rajola (Plena/Plantilla) was
/// bought and moved into panopus-library/errorerror/.
pub const MIGRATION_V5: &str = r#"
INSERT INTO sources (name, licence_status, note) VALUES
  ('errorerror', 'bought', 'EE Rajola purchased from errorerror.studio; licence doc in panopus-library/errorerror/')
  ON CONFLICT(name) DO UPDATE SET licence_status = 'bought', note = excluded.note;
"#;

/// All schema migrations in order: (version, description, sql). Single
/// source of truth shared by the SQL plugin registration in `run()` and the
/// setup() bootstrap (`bootstrap::ensure_schema`) — the two MUST stay
/// identical, since sqlx validates a SHA-384 checksum of the exact SQL
/// string against its `_sqlx_migrations` ledger.
pub(crate) const MIGRATIONS: [(i64, &str, &str); 5] = [
    (1, "panopus_initial", MIGRATION_V1),
    (2, "panopus_seed_designers", MIGRATION_V2),
    (3, "panopus_velvetyne_source", MIGRATION_V3),
    (4, "panopus_font_sample_text", MIGRATION_V4),
    (5, "panopus_errorerror_source", MIGRATION_V5),
];

/// Global state: the active DB filename (default: "panopus.db").
/// In test mode this switches to "panopus_test.db".
pub(crate) struct ActiveDb(pub(crate) Mutex<String>);

/// Open the active app DB (app data dir + `ActiveDb` name) with the
/// standard connection setup: parent dir created if missing (rusqlite
/// creates the DB file but not its directory — first boot), foreign keys
/// enforced (rusqlite default is OFF), and a busy timeout so concurrent
/// plugin connections wait instead of failing.
pub(crate) fn open_app_db(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;
    let db_name = app
        .state::<ActiveDb>()
        .0
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .clone();
    let conn = rusqlite::Connection::open(app_dir.join(&db_name))
        .map_err(|e| format!("Failed to open DB: {e}"))?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| format!("Failed to enable foreign_keys: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| format!("Failed to set busy_timeout: {e}"))?;
    Ok(conn)
}

/// A single SQL statement with optional bind parameters.
#[derive(serde::Deserialize)]
struct SqlStatement {
    sql: String,
    params: Vec<JsonValue>,
}

/// Execute multiple SQL statements in a single SQLite transaction.
/// This avoids the connection-pool issue with the Tauri SQL plugin
/// where each IPC call may get a different connection.
/// Upper bound on statements per batch — the largest legitimate batch is a
/// full backup restore (a few thousand rows); anything beyond this is a bug
/// or abuse, not a real workload.
const MAX_BATCH_STATEMENTS: usize = 10_000;

#[tauri::command]
fn execute_batch(
    app: tauri::AppHandle,
    statements: Vec<SqlStatement>,
) -> Result<serde_json::Value, String> {
    if statements.len() > MAX_BATCH_STATEMENTS {
        return Err(format!(
            "batch too large: {} statements (max {MAX_BATCH_STATEMENTS})",
            statements.len()
        ));
    }
    let conn = open_app_db(&app)?;

    conn.execute_batch("BEGIN")
        .map_err(|e| format!("BEGIN failed: {e}"))?;

    let mut last_insert_id: i64 = 0;

    for (i, stmt) in statements.iter().enumerate() {
        // Check if this statement references the parent insert ID
        let uses_parent_id = stmt.sql.contains("$LAST_INSERT_ID");
        // Allow referencing the last insert ID in subsequent statements
        let sql = stmt.sql.replace("$LAST_INSERT_ID", &last_insert_id.to_string());
        // Convert $1, $2, ... placeholders to ?1, ?2, ... for rusqlite
        let sql = convert_placeholders(&sql);
        let params: Vec<Box<dyn rusqlite::types::ToSql>> = stmt
            .params
            .iter()
            .map(|v| json_to_sql(v))
            .collect();
        let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|b| &**b).collect();

        match conn.execute(&sql, refs.as_slice()) {
            Ok(_) => {
                // Only update last_insert_id for parent INSERTs (statements that
                // don't reference $LAST_INSERT_ID). This ensures child INSERTs
                // (e.g. line items) don't overwrite the parent's rowid.
                if !uses_parent_id {
                    last_insert_id = conn.last_insert_rowid();
                }
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(format!("statement {i} failed: {e}"));
            }
        }
    }

    if let Err(e) = conn.execute_batch("COMMIT") {
        // Self-documenting all-or-nothing: never leave a transaction open
        let _ = conn.execute_batch("ROLLBACK");
        return Err(format!("COMMIT failed: {e}"));
    }

    Ok(serde_json::json!({ "lastInsertId": last_insert_id }))
}

/// Convert Tauri SQL plugin style $1, $2 placeholders to rusqlite ?1, ?2.
/// Text inside single-quoted SQL string literals is left untouched — a
/// literal like '$1 fee' must not become a placeholder.
fn convert_placeholders(sql: &str) -> String {
    let mut result = String::with_capacity(sql.len());
    let mut chars = sql.chars().peekable();
    let mut in_string = false;
    while let Some(c) = chars.next() {
        if c == '\'' {
            in_string = !in_string;
            result.push(c);
            continue;
        }
        if in_string {
            result.push(c);
            continue;
        }
        if c == '$' {
            // Check if followed by digits
            let mut digits = String::new();
            while let Some(&d) = chars.peek() {
                if d.is_ascii_digit() {
                    digits.push(d);
                    chars.next();
                } else {
                    break;
                }
            }
            if digits.is_empty() {
                result.push('$');
            } else {
                result.push('?');
                result.push_str(&digits);
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn json_to_sql(v: &JsonValue) -> Box<dyn rusqlite::types::ToSql> {
    match v {
        JsonValue::Null => Box::new(Option::<String>::None),
        JsonValue::Bool(b) => Box::new(if *b { 1i64 } else { 0i64 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else {
                Box::new(n.as_f64().unwrap_or(0.0))
            }
        }
        JsonValue::String(s) => Box::new(s.clone()),
        _ => Box::new(v.to_string()),
    }
}

/// Snapshot production DB and copy to test DB. Returns the test DB path.
#[tauri::command]
fn enter_test_mode(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let prod_db = app_dir.join("panopus.db");
    let snapshot_db = app_dir.join("panopus_snapshot.db");
    let test_db = app_dir.join("panopus_test.db");

    // Snapshot production DB (safety net) — WAL-safe consistent image
    dbfiles::snapshot_db_file(&prod_db, &snapshot_db)
        .map_err(|e| format!("Failed to snapshot production DB: {e}"))?;

    // Copy production DB to test DB
    dbfiles::snapshot_db_file(&prod_db, &test_db)
        .map_err(|e| format!("Failed to create test DB: {e}"))?;

    // Switch active DB to test
    let active_db = app.state::<ActiveDb>();
    *active_db.0.lock().map_err(|e| format!("Lock error: {e}"))? = "panopus_test.db".to_string();

    Ok(test_db.to_string_lossy().to_string())
}

/// Exit test mode: switch back to production DB and remove test DB.
#[tauri::command]
fn exit_test_mode(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let test_db = app_dir.join("panopus_test.db");

    // Switch back to production DB
    let active_db = app.state::<ActiveDb>();
    *active_db.0.lock().map_err(|e| format!("Lock error: {e}"))? = "panopus.db".to_string();

    // Remove test DB together with its WAL/SHM companions
    dbfiles::remove_db_files(&test_db);

    Ok(())
}

/// Enter presentation mode: snapshot prod DB, create empty presentation DB, switch to it.
#[tauri::command]
fn enter_presentation_mode(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let prod_db = app_dir.join("panopus.db");
    let snapshot_db = app_dir.join("panopus_snapshot.db");
    let pres_db = app_dir.join("panopus_presentation.db");

    // Snapshot production DB (safety net) — WAL-safe consistent image
    dbfiles::snapshot_db_file(&prod_db, &snapshot_db)
        .map_err(|e| format!("Failed to snapshot production DB: {e}"))?;

    // Copy production DB to presentation DB (so schema/migrations are intact)
    dbfiles::snapshot_db_file(&prod_db, &pres_db)
        .map_err(|e| format!("Failed to create presentation DB: {e}"))?;

    // Switch active DB to presentation
    let active_db = app.state::<ActiveDb>();
    *active_db.0.lock().map_err(|e| format!("Lock error: {e}"))? = "panopus_presentation.db".to_string();

    Ok(pres_db.to_string_lossy().to_string())
}

/// Exit presentation mode: switch back to production DB and remove presentation DB.
#[tauri::command]
fn exit_presentation_mode(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let pres_db = app_dir.join("panopus_presentation.db");

    // Switch back to production DB
    let active_db = app.state::<ActiveDb>();
    *active_db.0.lock().map_err(|e| format!("Lock error: {e}"))? = "panopus.db".to_string();

    // Remove presentation DB together with its WAL/SHM companions
    dbfiles::remove_db_files(&pres_db);

    Ok(())
}

/// Create a manual snapshot of the production DB.
#[tauri::command]
fn snapshot_db(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let prod_db = app_dir.join("panopus.db");
    let snapshot_db = app_dir.join("panopus_snapshot.db");

    dbfiles::snapshot_db_file(&prod_db, &snapshot_db)
        .map_err(|e| format!("Failed to snapshot DB: {e}"))?;

    Ok(snapshot_db.to_string_lossy().to_string())
}

/// Restore production DB from snapshot.
#[tauri::command]
fn restore_snapshot(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let prod_db = app_dir.join("panopus.db");
    let snapshot_db = app_dir.join("panopus_snapshot.db");

    if !snapshot_db.exists() {
        return Err("No snapshot found".to_string());
    }

    // Online backup API: restores INTO the live DB with proper locking, so
    // open plugin connections keep working and see the restored content.
    dbfiles::restore_db_file(&snapshot_db, &prod_db)
        .map_err(|e| format!("Failed to restore snapshot: {e}"))?;

    Ok(())
}

/// Check if a snapshot file exists.
#[tauri::command]
fn has_snapshot(app: tauri::AppHandle) -> Result<bool, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(app_dir.join("panopus_snapshot.db").exists())
}

/// Get the currently active DB name.
#[tauri::command]
fn get_active_db(app: tauri::AppHandle) -> Result<String, String> {
    let active_db = app.state::<ActiveDb>();
    let name = active_db.0.lock().map_err(|e| format!("Lock error: {e}"))?.clone();
    Ok(name)
}

/// Open a directory in Finder, or reveal a file in its enclosing folder
/// (macOS `open` command). The path is canonicalized first: it must exist
/// and resolve to an absolute path, and a canonical path can never start
/// with `-`, so it cannot be misparsed as an `open` flag.
#[tauri::command]
async fn open_in_finder(path: String) -> Result<(), String> {
    let canonical =
        std::fs::canonicalize(&path).map_err(|e| format!("path not found: {path} ({e})"))?;
    if !canonical.is_absolute() {
        return Err(format!("path is not absolute: {path}"));
    }
    let mut cmd = std::process::Command::new("open");
    if canonical.is_file() {
        // Reveal files in their enclosing Finder window instead of
        // launching the default application for the file type.
        cmd.arg("-R");
    }
    let output = cmd.arg(&canonical).output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(format!("open failed for {path}: status {}", output.status))
        } else {
            Err(format!("open failed for {path}: {stderr}"))
        }
    }
}

/// Run a full font index (library + system dirs) against the active DB.
/// Async so Tauri executes it on the async runtime instead of blocking the
/// main thread while the full scan runs.
#[tauri::command]
async fn index_library(app: tauri::AppHandle) -> Result<indexer::IndexReport, String> {
    indexer::run_full_index(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations: Vec<Migration> = MIGRATIONS
        .iter()
        .map(|&(version, description, sql)| Migration {
            version,
            description,
            sql,
            kind: tauri_plugin_sql::MigrationKind::Up,
        })
        .collect();

    tauri::Builder::default()
        .manage(ActiveDb(Mutex::new("panopus.db".to_string())))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:panopus.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            execute_batch,
            enter_test_mode,
            exit_test_mode,
            enter_presentation_mode,
            exit_presentation_mode,
            snapshot_db,
            restore_snapshot,
            has_snapshot,
            get_active_db,
            open_in_finder,
            index_library,
            activation::set_fonts_active,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Launch order: DB bootstrap (migrations) → CoreText
            // reactivation → library watcher. The SQL plugin only applies
            // migrations lazily on the frontend's first Database.load, so
            // on a fresh install NOTHING below would find a schema without
            // the explicit bootstrap (see bootstrap.rs for how it stays
            // compatible with the plugin's _sqlx_migrations ledger).
            // Everything here is non-fatal: log and continue.
            match open_app_db(app.handle()) {
                Ok(conn) => {
                    if let Err(e) = bootstrap::ensure_schema(&conn) {
                        eprintln!("startup schema bootstrap failed: {e}");
                    }
                    // Re-register active fonts with CoreText — user-scope
                    // registrations don't reliably survive restarts.
                    activation::reactivate_all(&conn);
                    // Read library_path (tilde-expanded) and spawn the
                    // watcher thread against it.
                    match conn.query_row(
                        "SELECT value FROM settings WHERE key = 'library_path'",
                        [],
                        |r| r.get::<_, String>(0),
                    ) {
                        Ok(library_path) => {
                            let library_root = indexer::expand_tilde(&library_path);
                            watcher::spawn(app.handle().clone(), library_root);
                        }
                        Err(e) => eprintln!("library watcher setup skipped: {e}"),
                    }
                }
                Err(e) => eprintln!("startup DB setup skipped: {e}"),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_dollar_placeholders_to_question_marks() {
        assert_eq!(
            convert_placeholders("SELECT * FROM t WHERE a = $1 AND b = $12"),
            "SELECT * FROM t WHERE a = ?1 AND b = ?12"
        );
    }

    #[test]
    fn leaves_a_bare_dollar_untouched() {
        assert_eq!(convert_placeholders("a $ b"), "a $ b");
    }

    #[test]
    fn does_not_convert_inside_string_literals() {
        assert_eq!(
            convert_placeholders("UPDATE t SET label = '$1 fee' WHERE id = $1"),
            "UPDATE t SET label = '$1 fee' WHERE id = ?1"
        );
        // '' is an escaped quote INSIDE the literal — $2 in the literal must
        // survive, the one outside must convert
        assert_eq!(
            convert_placeholders("SELECT 'it''s $2', $2"),
            "SELECT 'it''s $2', ?2"
        );
    }

    #[test]
    fn json_values_bind_with_their_sql_types() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let q = |v: &JsonValue| -> rusqlite::types::Value {
            let boxed = json_to_sql(v);
            conn.query_row("SELECT ?1", [&*boxed], |r| r.get(0)).unwrap()
        };
        use rusqlite::types::Value;
        assert_eq!(q(&serde_json::json!("x")), Value::Text("x".into()));
        assert_eq!(q(&serde_json::json!(7)), Value::Integer(7));
        assert_eq!(q(&serde_json::json!(1.5)), Value::Real(1.5));
        assert_eq!(q(&serde_json::json!(true)), Value::Integer(1));
        assert_eq!(q(&serde_json::json!(null)), Value::Null);
    }
}
