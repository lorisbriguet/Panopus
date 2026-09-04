//! CoreText font activation: register/unregister font files with the user
//! scope via CTFontManager, and mirror ONLY confirmed outcomes into the
//! `active` column (truthful state, never optimistic).

use core_foundation::{base::TCFType, error::CFErrorRef, url::CFURL};
use std::path::PathBuf;

/// kCTFontManagerScopeUser — registration persists for the current user.
const K_CT_FONT_MANAGER_SCOPE_USER: u32 = 2;

extern "C" {
    fn CTFontManagerRegisterFontsForURL(
        font_url: core_foundation::url::CFURLRef,
        scope: u32,
        error: *mut CFErrorRef,
    ) -> bool;
    fn CTFontManagerUnregisterFontsForURL(
        font_url: core_foundation::url::CFURLRef,
        scope: u32,
        error: *mut CFErrorRef,
    ) -> bool;
}

/// Per-font outcome returned to the frontend by `set_fonts_active`.
#[derive(Debug, serde::Serialize)]
pub struct FontActivationResult {
    pub id: i64,
    pub ok: bool,
    pub error: Option<String>,
}

/// Register (or unregister) each path with CoreText in the user scope.
/// "Already registered" (105) and "not registered" (201) count as success
/// so repeated toggles are idempotent.
pub fn register_paths(paths: &[PathBuf], register: bool) -> Vec<Result<(), String>> {
    paths
        .iter()
        .map(|p| {
            let url = CFURL::from_path(p, false)
                .ok_or_else(|| format!("bad path: {}", p.display()))?;
            let mut err: CFErrorRef = std::ptr::null_mut();
            let ok = unsafe {
                if register {
                    CTFontManagerRegisterFontsForURL(
                        url.as_concrete_TypeRef(),
                        K_CT_FONT_MANAGER_SCOPE_USER,
                        &mut err,
                    )
                } else {
                    CTFontManagerUnregisterFontsForURL(
                        url.as_concrete_TypeRef(),
                        K_CT_FONT_MANAGER_SCOPE_USER,
                        &mut err,
                    )
                }
            };
            if ok {
                return Ok(());
            }
            // A null error with a false return would crash
            // wrap_under_create_rule — guard it with a generic message.
            if err.is_null() {
                return Err("CoreText failed without an error object".to_string());
            }
            let e = unsafe { core_foundation::error::CFError::wrap_under_create_rule(err) };
            match e.code() {
                105 if register => Ok(()),  // already registered
                201 if !register => Ok(()), // not registered
                code => Err(format!("CoreText error {code}: {}", e.description())),
            }
        })
        .collect()
}

/// Flip `active` ONLY for fonts whose CoreText call succeeded. Failed rows
/// keep their previous state so the DB never claims an activation that
/// didn't happen.
pub fn set_active_in_db(
    conn: &rusqlite::Connection,
    results: &[(i64, Result<(), String>)],
    active: bool,
) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("UPDATE fonts SET active = ?1 WHERE id = ?2")?;
    for (id, res) in results {
        if res.is_ok() {
            stmt.execute(rusqlite::params![active as i64, id])?;
        }
    }
    Ok(())
}

/// Re-register every font marked active on startup — CoreText user-scope
/// registrations do not survive process restarts reliably, so the DB is
/// the source of truth. Fonts whose files are gone (or refused) are logged
/// and flipped to `active = 0`.
pub fn reactivate_all(conn: &rusqlite::Connection) {
    let rows: Vec<(i64, PathBuf)> = match conn
        .prepare("SELECT id, path FROM fonts WHERE active = 1 AND is_system = 0")
        .and_then(|mut s| {
            s.query_map([], |r| {
                Ok((r.get::<_, i64>(0)?, PathBuf::from(r.get::<_, String>(1)?)))
            })?
            .collect()
        }) {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("reactivate_all: failed to read active fonts: {e}");
            return;
        }
    };
    if rows.is_empty() {
        return;
    }
    let paths: Vec<PathBuf> = rows.iter().map(|(_, p)| p.clone()).collect();
    let results = register_paths(&paths, true);
    for ((id, path), res) in rows.iter().zip(results) {
        if let Err(e) = res {
            eprintln!(
                "reactivate_all: font {id} ({}) failed, deactivating: {e}",
                path.display()
            );
            if let Err(db_err) =
                conn.execute("UPDATE fonts SET active = 0 WHERE id = ?1", [id])
            {
                eprintln!("reactivate_all: failed to deactivate font {id}: {db_err}");
            }
        }
    }
}

/// Activate or deactivate a batch of fonts. Async so bulk CoreText calls
/// run on the async runtime instead of blocking the main thread.
#[tauri::command]
pub async fn set_fonts_active(
    app: tauri::AppHandle,
    ids: Vec<i64>,
    active: bool,
) -> Result<Vec<FontActivationResult>, String> {
    let conn = crate::open_app_db(&app)?;

    // Resolve id → path, keeping ids without a row as immediate errors.
    let mut found: Vec<(i64, PathBuf)> = Vec::new();
    let mut missing: Vec<i64> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT path FROM fonts WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        for id in &ids {
            match stmt.query_row([id], |r| r.get::<_, String>(0)) {
                Ok(p) => found.push((*id, PathBuf::from(p))),
                Err(rusqlite::Error::QueryReturnedNoRows) => missing.push(*id),
                Err(e) => return Err(e.to_string()),
            }
        }
    }

    let paths: Vec<PathBuf> = found.iter().map(|(_, p)| p.clone()).collect();
    let ct_results = register_paths(&paths, active);
    let results: Vec<(i64, Result<(), String>)> = found
        .iter()
        .map(|(id, _)| *id)
        .zip(ct_results)
        .collect();

    set_active_in_db(&conn, &results, active).map_err(|e| e.to_string())?;

    let mut out: Vec<FontActivationResult> = results
        .into_iter()
        .map(|(id, res)| FontActivationResult {
            id,
            ok: res.is_ok(),
            error: res.err(),
        })
        .collect();
    out.extend(missing.into_iter().map(|id| FontActivationResult {
        id,
        ok: false,
        error: Some("font not found in database".to_string()),
    }));
    Ok(out)
}
