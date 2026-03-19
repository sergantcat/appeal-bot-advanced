const { REST, Routes } = require('discord.js');
const db = require('../../database');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[BOT] Logged in as ${client.user.tag}`);
    console.log(`[BOT] Serving ${client.guilds.cache.size} guild(s)`);

    // Initialize database
    db.init();

    // Update guild info in database
    for (const [guildId, guild] of client.guilds.cache) {
      db.upsertGuildSettings(guildId, {
        guild_name: guild.name,
        guild_icon: guild.iconURL() || '',
      });
    }

    // Register slash commands
    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      if (command.data) {
        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command);
      }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
      console.log(`[BOT] Registering ${commands.length} slash command(s)...`);
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log('[BOT] Slash commands registered successfully');
    } catch (error) {
      console.error('[BOT] Error registering commands:', error);
    }

    // Set bot status
    client.user.setActivity('Appeals | /setup', { type: 3 });
  },
};
