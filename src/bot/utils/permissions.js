const db = require('../../database');

function isStaff(member, guildId) {
  const settings = db.getGuildSettings(guildId);
  if (!settings) return false;

  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  if (adminIds.includes(member.id)) return true;

  if (member.permissions.has('Administrator')) return true;

  if (settings.staff_role_id && member.roles.cache.has(settings.staff_role_id)) return true;
  if (settings.admin_role_id && member.roles.cache.has(settings.admin_role_id)) return true;
  if (settings.manager_role_id && member.roles.cache.has(settings.manager_role_id)) return true;

  return false;
}

function isAdmin(member, guildId) {
  const settings = db.getGuildSettings(guildId);
  if (!settings) return false;

  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  if (adminIds.includes(member.id)) return true;

  if (member.permissions.has('Administrator')) return true;

  if (settings.admin_role_id && member.roles.cache.has(settings.admin_role_id)) return true;

  return false;
}

function isDashboardAdmin(userId) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  return adminIds.includes(userId);
}

module.exports = { isStaff, isAdmin, isDashboardAdmin };
