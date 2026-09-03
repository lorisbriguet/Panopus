import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { logError } from "../lib/log";
import { getLabels } from "../lib/notifyError";

const SAFE_FIELD = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Validate that SQL field names contain only safe characters to prevent injection */
export function validateFields(fields: string[]): void {
  for (const f of fields) {
    if (!SAFE_FIELD.test(f)) {
      throw new Error(`Invalid field name: ${f}`);
    }
  }
}

interface BatchStatement {
  sql: string;
  params: unknown[];
}

/**
 * Collect SQL statements for batch execution in a real transaction.
 * Uses a Rust-side command that opens its own connection and wraps
 * all statements in BEGIN/COMMIT, avoiding the connection-pool issue
 * with the Tauri SQL plugin where each IPC call may use a different connection.
 */
export class TransactionBatch {
  private statements: BatchStatement[] = [];

  /** Queue a SQL statement. Use $LAST_INSERT_ID to reference the last insert rowid. */
  add(sql: string, params: unknown[] = []): void {
    this.statements.push({ sql, params });
  }

  /** Execute all queued statements in a single Rust-side transaction. */
  async commit(): Promise<{ lastInsertId: number }> {
    return invoke<{ lastInsertId: number }>("execute_batch", {
      statements: this.statements,
    });
  }
}

let dbPromise: Promise<Database> | null = null;
let currentDbName = localStorage.getItem("presentationMode") === "true"
  ? "panopus_presentation.db"
  : localStorage.getItem("testMode") === "true"
    ? "panopus_test.db"
    : "panopus.db";

let dbFatalShown = false;

/**
 * Render a full-screen fatal error overlay directly into the DOM.
 * getDb() is first called from async code (React Query hooks, startup
 * hooks), so a schema-migration failure never reaches the React
 * ErrorBoundary — this guard makes it visibly fatal regardless.
 */
function showFatalDbError(err: unknown): void {
  if (dbFatalShown) return;
  dbFatalShown = true;
  try {
    const t = getLabels();
    const overlay = document.createElement("div");
    overlay.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center;background:#fff;color:#111;font-family:system-ui,-apple-system,sans-serif;"
    );
    const title = document.createElement("h1");
    title.textContent = t.page_error_title;
    title.setAttribute("style", "font-size:16px;font-weight:600;margin:0;");
    const message = document.createElement("p");
    message.textContent = t.db_init_failed;
    message.setAttribute("style", "font-size:13px;max-width:480px;margin:0;");
    const detail = document.createElement("p");
    detail.textContent = err instanceof Error ? err.message : String(err);
    detail.setAttribute("style", "font-size:12px;color:#666;max-width:480px;margin:0;word-break:break-word;");
    overlay.append(title, message, detail);
    overlay.setAttribute("role", "alert");
    overlay.tabIndex = -1;
    document.body.appendChild(overlay);
    overlay.focus();
  } catch {
    // Never mask the original error because the overlay itself failed
  }
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await Database.load(`sqlite:${currentDbName}`);
      try {
        await ensureSchema(database);
      } catch (e) {
        // Do NOT continue on a half-migrated schema: surface fatally and
        // rethrow so every getDb() caller rejects.
        logError("[DB] ensureSchema failed:", e);
        showFatalDbError(e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      return database;
    })();
  }
  return dbPromise;
}

/**
 * Switch the frontend DB connection to a different database file.
 * Closes the current connection and opens the new one.
 */
export async function switchDb(dbName: string): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.close();
    } catch { /* ignore close errors */ }
    dbPromise = null;
  }
  currentDbName = dbName;
  // Pre-warm the new connection
  await getDb();
}

/**
 * Reset the DB connection (e.g., after restoring a snapshot).
 * Closes and reopens with the same DB name.
 */
export async function resetDb(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.close();
    } catch { /* ignore close errors */ }
    dbPromise = null;
  }
  await getDb();
}

/**
 * Panopus schema: Task 3 will add tables via migrations.
 * For now, just clean up any orphan indices from previous runs.
 */
async function ensureSchema(db: Database) {
  // Clean up orphan indices (indices referencing dropped tables)
  try {
    const orphans = await db.select<{ name: string; tbl_name: string }[]>(
      `SELECT i.name, i.tbl_name FROM sqlite_master i
       WHERE i.type = 'index' AND i.tbl_name NOT IN (SELECT name FROM sqlite_master WHERE type = 'table')`
    );
    for (const o of orphans) {
      await db.execute(`DROP INDEX IF EXISTS "${o.name.replace(/"/g, '""')}"`).catch(() => {});
    }
  } catch { /* ignore if schema query fails */ }
}
