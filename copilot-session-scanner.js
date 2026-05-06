const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

function toIso(value) {
  if (!value) return new Date(0).toISOString();
  if (typeof value !== 'string') {
    try {
      return new Date(value).toISOString();
    } catch {
      return new Date(0).toISOString();
    }
  }
  // Already ISO8601 (contains 'T' and ends with Z or offset)
  if (/T/.test(value) && /(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // SQLite default 'YYYY-MM-DD HH:MM:SS' (UTC)
  const sqlite = value.replace(' ', 'T') + 'Z';
  const d = new Date(sqlite);
  if (!isNaN(d.getTime())) return d.toISOString();
  const d2 = new Date(value);
  if (!isNaN(d2.getTime())) return d2.toISOString();
  return new Date(0).toISOString();
}

function deriveFolder(cwd) {
  return cwd.replace(/[\\/:_]/g, '-').replace(/^-/, '-');
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

function scanCopilotSessions() {
  const dbPath = path.join(os.homedir(), '.copilot', 'session-store.db');
  let db;
  try {
    if (!fs.existsSync(dbPath)) return [];
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const rows = db.prepare(`
      SELECT s.id, s.cwd, s.repository, s.branch, s.summary, s.created_at, s.updated_at,
             COUNT(t.id) as turnCount,
             (SELECT t2.user_message FROM turns t2 WHERE t2.session_id = s.id AND t2.turn_index = 1) as firstMessage
      FROM sessions s
      LEFT JOIN turns t ON t.session_id = s.id
      WHERE s.cwd IS NOT NULL AND s.cwd != ''
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all();

    const sessions = rows
      .filter((r) => r.cwd && r.cwd.length > 0)
      .map((row) => {
        const summary = truncate(row.summary || row.firstMessage || 'Copilot session', 120);
        return {
          sessionId: row.id,
          folder: deriveFolder(row.cwd),
          projectPath: row.cwd,
          summary,
          firstPrompt: summary,
          created: toIso(row.created_at),
          modified: toIso(row.updated_at),
          messageCount: row.turnCount || 0,
          slug: row.branch || null,
          provider: 'copilot',
        };
      });

    return sessions;
  } catch {
    return [];
  } finally {
    if (db) try { db.close(); } catch {}
  }
}

module.exports = { scanCopilotSessions };
