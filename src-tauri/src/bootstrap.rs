//! First-boot schema bootstrap.
//!
//! tauri-plugin-sql applies migrations lazily: only when the frontend calls
//! `Database.load` (no `preload` is configured). `setup()` runs before any
//! webview code, so on a fresh install the app DB does not exist yet when
//! startup font reactivation and the library watcher need it. This module
//! applies the same migrations through rusqlite, guarded by — and recorded
//! in — the exact ledger sqlx uses (`_sqlx_migrations`), so the plugin's
//! later `Database.load` sees every version applied with a matching
//! checksum and does nothing.
//!
//! Compatibility contract with tauri-plugin-sql 2.4 / sqlx 0.8 (verified
//! against both crates' sources):
//! - sqlx creates the ledger with `CREATE TABLE IF NOT EXISTS
//!   _sqlx_migrations (...)` (sqlx-sqlite `ensure_migrations_table`), so
//!   pre-creating the identical table here is safe;
//! - the checksum sqlx validates is `Sha384(sql.as_bytes())` over the exact
//!   migration string registered with the plugin — both sides read the same
//!   `crate::MIGRATIONS` const, so checksums match by construction;
//! - a version recorded with `success = TRUE` and a matching checksum is
//!   skipped by `Migrator::run`; a missing version is applied; a checksum
//!   mismatch errors (guarded by a test below); `success = FALSE` rows make
//!   the migrator abort as dirty, so rows are only written on commit.

use rusqlite::Connection;
use sha2::{Digest, Sha384};

/// sqlx's SQLite migrations ledger, byte-identical to the table
/// `sqlx-sqlite` 0.8 creates in `ensure_migrations_table`.
const SQLX_LEDGER: &str = "\
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
);";

fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .map_err(|e| format!("table_exists({name}): {e}"))
}

fn ledger_has(conn: &Connection, version: i64) -> Result<bool, String> {
    conn.query_row(
        "SELECT count(*) FROM _sqlx_migrations WHERE version = ?1",
        [version],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .map_err(|e| format!("ledger lookup for migration {version}: {e}"))
}

/// True when a migration's *content* is already present even though the
/// ledger has no row for it. This state cannot arise from our own code
/// paths (plugin and bootstrap both write the ledger transactionally with
/// the content); if it ever occurs, re-applying would hard-fail on CREATE
/// TABLE / UNIQUE constraints, so the bootstrap skips and leaves the
/// anomaly for the plugin's own migrator to surface.
fn content_already_present(conn: &Connection, version: i64) -> Result<bool, String> {
    match version {
        1 => table_exists(conn, "fonts"),
        2 => {
            if !table_exists(conn, "designers")? {
                return Ok(false);
            }
            conn.query_row("SELECT count(*) FROM designers", [], |r| r.get::<_, i64>(0))
                .map(|n| n > 0)
                .map_err(|e| format!("designers count: {e}"))
        }
        _ => Ok(false),
    }
}

/// Idempotently bring the app DB to the current schema, recording applied
/// versions in sqlx's own ledger so tauri-plugin-sql treats them as done.
/// Safe to call on every boot: already-recorded versions are skipped.
pub(crate) fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SQLX_LEDGER)
        .map_err(|e| format!("create _sqlx_migrations: {e}"))?;

    for (version, description, sql) in crate::MIGRATIONS {
        if ledger_has(conn, version)? {
            continue;
        }
        if content_already_present(conn, version)? {
            eprintln!(
                "schema bootstrap: migration {version} content present without a ledger row; \
                 skipping (left for the SQL plugin to surface)"
            );
            continue;
        }
        // Mirror sqlx's apply: migration SQL + ledger row in ONE transaction
        // so a crash can never record a half-applied migration.
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin migration {version}: {e}"))?;
        tx.execute_batch(sql)
            .map_err(|e| format!("apply migration {version}: {e}"))?;
        let checksum: Vec<u8> = Sha384::digest(sql.as_bytes()).to_vec();
        tx.execute(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES (?1, ?2, TRUE, ?3, -1)",
            rusqlite::params![version, description, checksum],
        )
        .map_err(|e| format!("record migration {version}: {e}"))?;
        tx.commit()
            .map_err(|e| format!("commit migration {version}: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn bootstraps_fresh_db_with_schema_seed_and_ledger() {
        let conn = mem();
        ensure_schema(&conn).unwrap();
        for table in ["fonts", "tags", "font_tags", "sources", "designers", "designer_sources", "settings"] {
            assert!(table_exists(&conn, table).unwrap(), "missing table {table}");
        }
        assert_eq!(count(&conn, "SELECT count(*) FROM designers"), 10);
        let library_path: String = conn
            .query_row("SELECT value FROM settings WHERE key = 'library_path'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(library_path, "~/Documents/GitHub/panopus-library");
        assert_eq!(
            count(&conn, "SELECT count(*) FROM _sqlx_migrations WHERE success = 1"),
            crate::MIGRATIONS.len() as i64
        );
    }

    #[test]
    fn ledger_checksums_are_sqlx_sha384_of_the_registered_sql() {
        // sqlx validates Sha384(sql) for every already-recorded version; a
        // mismatch would make the frontend's Database.load hard-fail, so
        // this equality IS the plugin-compatibility guarantee.
        let conn = mem();
        ensure_schema(&conn).unwrap();
        for (version, _, sql) in crate::MIGRATIONS {
            let stored: Vec<u8> = conn
                .query_row(
                    "SELECT checksum FROM _sqlx_migrations WHERE version = ?1",
                    [version],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(stored.len(), 48, "SHA-384 is 48 bytes");
            assert_eq!(stored, Sha384::digest(sql.as_bytes()).to_vec());
        }
    }

    #[test]
    fn bootstrap_is_idempotent() {
        let conn = mem();
        ensure_schema(&conn).unwrap();
        ensure_schema(&conn).unwrap();
        assert_eq!(count(&conn, "SELECT count(*) FROM designers"), 10);
        assert_eq!(
            count(&conn, "SELECT count(*) FROM _sqlx_migrations"),
            crate::MIGRATIONS.len() as i64
        );
    }

    #[test]
    fn respects_an_existing_plugin_ledger() {
        // Simulate a DB the SQL plugin already migrated to v1 (its ledger
        // row carries the plugin's own checksum): bootstrap must keep that
        // row untouched and only apply v2.
        let conn = mem();
        conn.execute_batch(SQLX_LEDGER).unwrap();
        conn.execute_batch(crate::MIGRATION_V1).unwrap();
        conn.execute(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES (1, 'panopus_initial', TRUE, x'ab', 7)",
            [],
        )
        .unwrap();

        ensure_schema(&conn).unwrap();

        let v1_checksum: Vec<u8> = conn
            .query_row("SELECT checksum FROM _sqlx_migrations WHERE version = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v1_checksum, vec![0xabu8], "pre-existing ledger row rewritten");
        assert_eq!(count(&conn, "SELECT count(*) FROM designers"), 10, "v2 not applied");
        assert_eq!(
            count(&conn, "SELECT count(*) FROM _sqlx_migrations"),
            crate::MIGRATIONS.len() as i64
        );
    }

    #[test]
    fn skips_content_present_without_a_ledger_row() {
        // Anomalous state: v1 tables exist but no ledger. Re-applying would
        // fail on CREATE TABLE; bootstrap must skip v1 without erroring and
        // must NOT claim it in the ledger (the plugin stays authoritative).
        let conn = mem();
        conn.execute_batch(crate::MIGRATION_V1).unwrap();
        ensure_schema(&conn).unwrap();
        assert_eq!(count(&conn, "SELECT count(*) FROM _sqlx_migrations WHERE version = 1"), 0);
        // v2's content was absent, so it applied normally.
        assert_eq!(count(&conn, "SELECT count(*) FROM designers"), 10);
        assert_eq!(count(&conn, "SELECT count(*) FROM _sqlx_migrations WHERE version = 2"), 1);
    }
}
