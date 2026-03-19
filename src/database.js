const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'appeals.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      guild_name TEXT DEFAULT '',
      guild_icon TEXT DEFAULT '',

      -- Channel IDs
      log_channel_id TEXT DEFAULT '',
      stats_channel_id TEXT DEFAULT '',
      evidence_channel_id TEXT DEFAULT '',
      discussion_channel_id TEXT DEFAULT '',
      moderation_channel_id TEXT DEFAULT '',
      admin_channel_id TEXT DEFAULT '',

      -- Role IDs
      staff_role_id TEXT DEFAULT '',
      admin_role_id TEXT DEFAULT '',
      manager_role_id TEXT DEFAULT '',

      -- General Settings
      cooldown_seconds INTEGER DEFAULT 600,
      max_active_appeals INTEGER DEFAULT 3,
      auto_thread INTEGER DEFAULT 1,
      require_evidence INTEGER DEFAULT 0,
      allow_reopen INTEGER DEFAULT 0,
      dm_notifications INTEGER DEFAULT 1,
      anonymous_appeals INTEGER DEFAULT 0,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS appeal_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      type_key TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT DEFAULT '',
      channel_id TEXT DEFAULT '',
      emoji TEXT DEFAULT '',
      color TEXT DEFAULT '#5865F2',
      button_style TEXT DEFAULT 'PRIMARY',
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,

      -- Embed config for the panel
      embed_title TEXT DEFAULT '',
      embed_description TEXT DEFAULT '',
      embed_color TEXT DEFAULT '#5865F2',
      embed_thumbnail TEXT DEFAULT '',
      embed_image TEXT DEFAULT '',
      embed_footer TEXT DEFAULT '',

      UNIQUE(guild_id, type_key),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
    );

    CREATE TABLE IF NOT EXISTS appeal_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_type_id INTEGER NOT NULL,
      question_label TEXT NOT NULL,
      question_placeholder TEXT DEFAULT '',
      question_style TEXT DEFAULT 'short',
      required INTEGER DEFAULT 1,
      max_length INTEGER DEFAULT 1024,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (appeal_type_id) REFERENCES appeal_types(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS appeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT DEFAULT '',
      appeal_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      thread_id TEXT DEFAULT '',
      claimed_by TEXT DEFAULT '',
      claimed_by_tag TEXT DEFAULT '',
      assigned_to TEXT DEFAULT '',
      responses TEXT DEFAULT '{}',
      staff_notes TEXT DEFAULT '',
      denial_reason TEXT DEFAULT '',
      resolution_notes TEXT DEFAULT '',
      evidence_urls TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME DEFAULT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
    );

    CREATE TABLE IF NOT EXISTS appeal_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT DEFAULT '',
      actor_tag TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT DEFAULT '',
      added_by TEXT DEFAULT '',
      added_by_tag TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS auto_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      trigger_status TEXT NOT NULL,
      appeal_type TEXT DEFAULT '',
      message_template TEXT DEFAULT '',
      dm_user INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
    );

    CREATE TABLE IF NOT EXISTS appeal_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
    );

    CREATE INDEX IF NOT EXISTS idx_appeals_guild ON appeals(guild_id);
    CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);
    CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);
    CREATE INDEX IF NOT EXISTS idx_appeal_logs_appeal ON appeal_logs(appeal_id);
    CREATE INDEX IF NOT EXISTS idx_blacklist_guild ON blacklist(guild_id);
  `);
}

// ============ Guild Settings ============
function getGuildSettings(guildId) {
  return db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
}

function upsertGuildSettings(guildId, data) {
  const existing = getGuildSettings(guildId);
  if (existing) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE guild_settings SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = @guild_id`)
      .run({ ...data, guild_id: guildId });
  } else {
    data.guild_id = guildId;
    const keys = Object.keys(data);
    const placeholders = keys.map(k => `@${k}`).join(', ');
    db.prepare(`INSERT INTO guild_settings (${keys.join(', ')}) VALUES (${placeholders})`)
      .run(data);
  }
  return getGuildSettings(guildId);
}

// ============ Appeal Types ============
function getAppealTypes(guildId) {
  return db.prepare('SELECT * FROM appeal_types WHERE guild_id = ? ORDER BY sort_order ASC').all(guildId);
}

function getAppealType(id) {
  return db.prepare('SELECT * FROM appeal_types WHERE id = ?').get(id);
}

function getAppealTypeByKey(guildId, typeKey) {
  return db.prepare('SELECT * FROM appeal_types WHERE guild_id = ? AND type_key = ?').get(guildId, typeKey);
}

function createAppealType(data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(k => `@${k}`).join(', ');
  const result = db.prepare(`INSERT INTO appeal_types (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
  return getAppealType(result.lastInsertRowid);
}

function updateAppealType(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE appeal_types SET ${fields} WHERE id = @id`).run({ ...data, id });
  return getAppealType(id);
}

function deleteAppealType(id) {
  db.prepare('DELETE FROM appeal_types WHERE id = ?').run(id);
}

// ============ Appeal Questions ============
function getQuestions(appealTypeId) {
  return db.prepare('SELECT * FROM appeal_questions WHERE appeal_type_id = ? ORDER BY sort_order ASC').all(appealTypeId);
}

function createQuestion(data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(k => `@${k}`).join(', ');
  return db.prepare(`INSERT INTO appeal_questions (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
}

function updateQuestion(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE appeal_questions SET ${fields} WHERE id = @id`).run({ ...data, id });
}

function deleteQuestion(id) {
  db.prepare('DELETE FROM appeal_questions WHERE id = ?').run(id);
}

function deleteQuestionsByType(appealTypeId) {
  db.prepare('DELETE FROM appeal_questions WHERE appeal_type_id = ?').run(appealTypeId);
}

// ============ Appeals ============
function getAppeals(guildId, filters = {}) {
  let query = 'SELECT * FROM appeals WHERE guild_id = ?';
  const params = [guildId];

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.user_id) {
    query += ' AND user_id = ?';
    params.push(filters.user_id);
  }
  if (filters.appeal_type) {
    query += ' AND appeal_type = ?';
    params.push(filters.appeal_type);
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(query).all(...params);
}

function getAppeal(id) {
  return db.prepare('SELECT * FROM appeals WHERE id = ?').get(id);
}

function createAppeal(data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(k => `@${k}`).join(', ');
  const result = db.prepare(`INSERT INTO appeals (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
  return getAppeal(result.lastInsertRowid);
}

function updateAppeal(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE appeals SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
  return getAppeal(id);
}

function getActiveAppealCount(guildId, userId) {
  const result = db.prepare(
    "SELECT COUNT(*) as count FROM appeals WHERE guild_id = ? AND user_id = ? AND status IN ('pending', 'under_review', 'escalated')"
  ).get(guildId, userId);
  return result.count;
}

function getUserLastAppealTime(guildId, userId) {
  const result = db.prepare(
    'SELECT MAX(created_at) as last_time FROM appeals WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId);
  return result.last_time ? new Date(result.last_time).getTime() : 0;
}

// ============ Appeal Logs ============
function addAppealLog(data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(k => `@${k}`).join(', ');
  db.prepare(`INSERT INTO appeal_logs (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
}

function getAppealLogs(appealId) {
  return db.prepare('SELECT * FROM appeal_logs WHERE appeal_id = ? ORDER BY created_at ASC').all(appealId);
}

// ============ Blacklist ============
function isBlacklisted(guildId, userId) {
  return !!db.prepare('SELECT 1 FROM blacklist WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

function getBlacklist(guildId) {
  return db.prepare('SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

function addToBlacklist(data) {
  try {
    const keys = Object.keys(data);
    const placeholders = keys.map(k => `@${k}`).join(', ');
    db.prepare(`INSERT INTO blacklist (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
    return true;
  } catch (e) {
    return false;
  }
}

function removeFromBlacklist(guildId, userId) {
  db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

// ============ Auto Responses ============
function getAutoResponses(guildId) {
  return db.prepare('SELECT * FROM auto_responses WHERE guild_id = ?').all(guildId);
}

function getAutoResponse(guildId, triggerStatus, appealType) {
  if (appealType) {
    return db.prepare(
      'SELECT * FROM auto_responses WHERE guild_id = ? AND trigger_status = ? AND (appeal_type = ? OR appeal_type = "") AND enabled = 1'
    ).get(guildId, triggerStatus, appealType);
  }
  return db.prepare(
    'SELECT * FROM auto_responses WHERE guild_id = ? AND trigger_status = ? AND enabled = 1'
  ).get(guildId, triggerStatus);
}

function createAutoResponse(data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(k => `@${k}`).join(', ');
  db.prepare(`INSERT INTO auto_responses (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
}

function updateAutoResponse(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE auto_responses SET ${fields} WHERE id = @id`).run({ ...data, id });
}

function deleteAutoResponse(id) {
  db.prepare('DELETE FROM auto_responses WHERE id = ?').run(id);
}

// ============ Templates ============
function getTemplates(guildId) {
  return db.prepare('SELECT * FROM appeal_templates WHERE guild_id = ?').all(guildId);
}

function createTemplate(data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(k => `@${k}`).join(', ');
  db.prepare(`INSERT INTO appeal_templates (${keys.join(', ')}) VALUES (${placeholders})`).run(data);
}

function updateTemplate(id, data) {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE appeal_templates SET ${fields} WHERE id = @id`).run({ ...data, id });
}

function deleteTemplate(id) {
  db.prepare('DELETE FROM appeal_templates WHERE id = ?').run(id);
}

// ============ Statistics ============
function getStats(guildId) {
  const total = db.prepare('SELECT COUNT(*) as c FROM appeals WHERE guild_id = ?').get(guildId).c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE guild_id = ? AND status = 'pending'").get(guildId).c;
  const underReview = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE guild_id = ? AND status = 'under_review'").get(guildId).c;
  const approved = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE guild_id = ? AND status = 'approved'").get(guildId).c;
  const denied = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE guild_id = ? AND status = 'denied'").get(guildId).c;
  const escalated = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE guild_id = ? AND status = 'escalated'").get(guildId).c;

  const byType = db.prepare(
    'SELECT appeal_type, COUNT(*) as count, SUM(CASE WHEN status = \'approved\' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN status = \'denied\' THEN 1 ELSE 0 END) as denied FROM appeals WHERE guild_id = ? GROUP BY appeal_type'
  ).all(guildId);

  const recent = db.prepare(
    "SELECT DATE(created_at) as date, COUNT(*) as count FROM appeals WHERE guild_id = ? AND created_at >= DATE('now', '-30 days') GROUP BY DATE(created_at) ORDER BY date ASC"
  ).all(guildId);

  return { total, pending, underReview, approved, denied, escalated, byType, recent };
}

module.exports = {
  init, db,
  getGuildSettings, upsertGuildSettings,
  getAppealTypes, getAppealType, getAppealTypeByKey, createAppealType, updateAppealType, deleteAppealType,
  getQuestions, createQuestion, updateQuestion, deleteQuestion, deleteQuestionsByType,
  getAppeals, getAppeal, createAppeal, updateAppeal, getActiveAppealCount, getUserLastAppealTime,
  addAppealLog, getAppealLogs,
  isBlacklisted, getBlacklist, addToBlacklist, removeFromBlacklist,
  getAutoResponses, getAutoResponse, createAutoResponse, updateAutoResponse, deleteAutoResponse,
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getStats
};
