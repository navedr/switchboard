const path = require("path");
const fs = require("fs");
const os = require("os");
const Database = require("better-sqlite3");

function scanCodexSessions() {
    const dbPath = path.join(os.homedir(), ".codex", "state_5.sqlite");

    if (!fs.existsSync(dbPath)) {
        return [];
    }

    let db;
    try {
        db = new Database(dbPath, { readonly: true, fileMustExist: true });

        const rows = db
            .prepare(
                `
      SELECT id, cwd, title, first_user_message, created_at, updated_at,
             tokens_used, git_branch, archived
      FROM threads
      WHERE archived = 0 AND (first_user_message != '' OR tokens_used > 0)
      ORDER BY updated_at DESC
    `,
            )
            .all();

        const sessions = rows.map(row => {
            const folder = row.cwd.replace(/[\\/:_]/g, "-").replace(/^-/, "-");
            const rawSummary = row.title || row.first_user_message || "";
            const summary = rawSummary.length > 120 ? rawSummary.slice(0, 120) : rawSummary;
            const created = new Date(row.created_at * 1000).toISOString();
            const modified = new Date(row.updated_at * 1000).toISOString();
            const messageCount = row.tokens_used > 0 ? Math.max(1, Math.floor(row.tokens_used / 500)) : 0;

            return {
                sessionId: row.id,
                folder,
                projectPath: row.cwd,
                summary,
                firstPrompt: summary,
                created,
                modified,
                messageCount,
                slug: row.git_branch || null,
                provider: "codex",
            };
        });

        return sessions;
    } catch (err) {
        return [];
    } finally {
        if (db) {
            try {
                db.close();
            } catch (_) {
                /* ignore */
            }
        }
    }
}

module.exports = { scanCodexSessions };
