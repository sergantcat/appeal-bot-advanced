const db = require('../../database');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    console.log(`[BOT] Joined guild: ${guild.name} (${guild.id})`);
    db.upsertGuildSettings(guild.id, {
      guild_name: guild.name,
      guild_icon: guild.iconURL() || '',
    });
  },
};
