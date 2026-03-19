const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { createAppealEmbed, createStatsEmbed, formatStatus } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Appeal management commands')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View an appeal')
        .addIntegerOption(opt => opt.setName('id').setDescription('Appeal ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('search')
        .setDescription('Search appeals')
        .addUserOption(opt => opt.setName('user').setDescription('Filter by user'))
        .addStringOption(opt => opt.setName('status').setDescription('Filter by status')
          .addChoices(
            { name: 'Pending', value: 'pending' },
            { name: 'Under Review', value: 'under_review' },
            { name: 'Approved', value: 'approved' },
            { name: 'Denied', value: 'denied' },
            { name: 'Escalated', value: 'escalated' },
            { name: 'Closed', value: 'closed' },
          ))
        .addStringOption(opt => opt.setName('type').setDescription('Filter by appeal type'))
    )
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('View appeal statistics')
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('View appeal history for a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('blacklist')
        .setDescription('Blacklist a user from appeals')
        .addUserOption(opt => opt.setName('user').setDescription('User to blacklist').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for blacklist'))
    )
    .addSubcommand(sub =>
      sub.setName('unblacklist')
        .setDescription('Remove a user from the blacklist')
        .addUserOption(opt => opt.setName('user').setDescription('User to unblacklist').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (!isStaff(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: '\u274C You do not have permission to use this command.', ephemeral: true });
    }

    switch (sub) {
      case 'view': return handleView(interaction);
      case 'search': return handleSearch(interaction);
      case 'stats': return handleStats(interaction);
      case 'history': return handleHistory(interaction);
      case 'blacklist': return handleBlacklist(interaction);
      case 'unblacklist': return handleUnblacklist(interaction);
    }
  },
};

async function handleView(interaction) {
  const id = interaction.options.getInteger('id');
  const appeal = db.getAppeal(id);

  if (!appeal || appeal.guild_id !== interaction.guildId) {
    return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });
  }

  let responses = {};
  try { responses = JSON.parse(appeal.responses || '{}'); } catch (e) { /* ignore */ }

  const embed = createAppealEmbed(appeal, responses);

  const logs = db.getAppealLogs(id);
  if (logs.length > 0) {
    const logText = logs.slice(-10).map(l =>
      `\`${new Date(l.created_at).toLocaleDateString()}\` ${l.action} by ${l.actor_tag || 'System'}`
    ).join('\n');
    embed.addFields({ name: '\u{1F4DC} Activity Log', value: logText, inline: false });
  }

  if (appeal.staff_notes) {
    embed.addFields({ name: '\u{1F4DD} Staff Notes', value: appeal.staff_notes.substring(0, 1024), inline: false });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSearch(interaction) {
  const user = interaction.options.getUser('user');
  const status = interaction.options.getString('status');
  const type = interaction.options.getString('type');

  const filters = { limit: 25 };
  if (user) filters.user_id = user.id;
  if (status) filters.status = status;
  if (type) filters.appeal_type = type;

  const appeals = db.getAppeals(interaction.guildId, filters);

  if (appeals.length === 0) {
    return interaction.reply({ content: '\u{1F4CB} No appeals found matching your criteria.', ephemeral: true });
  }

  const lines = appeals.map(a =>
    `**#${a.id}** | ${formatStatus(a.status)} | ${a.appeal_type} | <@${a.user_id}> | ${new Date(a.created_at).toLocaleDateString()}`
  );

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`\u{1F50D} Appeal Search Results (${appeals.length})`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStats(interaction) {
  const stats = db.getStats(interaction.guildId);
  const embed = createStatsEmbed(stats, interaction.guild.name);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleHistory(interaction) {
  const user = interaction.options.getUser('user');
  const appeals = db.getAppeals(interaction.guildId, { user_id: user.id, limit: 20 });

  if (appeals.length === 0) {
    return interaction.reply({ content: `\u{1F4CB} No appeals found for ${user.tag}.`, ephemeral: true });
  }

  const isBlacklisted = db.isBlacklisted(interaction.guildId, user.id);

  const lines = appeals.map(a =>
    `**#${a.id}** | ${formatStatus(a.status)} | ${a.appeal_type} | ${new Date(a.created_at).toLocaleDateString()}`
  );

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(isBlacklisted ? 0xE74C3C : 0x5865F2)
    .setTitle(`\u{1F4CB} Appeal History - ${user.tag}`)
    .setDescription(
      (isBlacklisted ? '\u{1F6AB} **This user is BLACKLISTED**\n\n' : '') +
      lines.join('\n')
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleBlacklist(interaction) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const success = db.addToBlacklist({
    guild_id: interaction.guildId,
    user_id: user.id,
    reason,
    added_by: interaction.user.id,
    added_by_tag: interaction.user.tag,
  });

  if (success) {
    return interaction.reply({ content: `\u{1F6AB} **${user.tag}** has been blacklisted from appeals.\n**Reason:** ${reason}` });
  }
  return interaction.reply({ content: `\u274C ${user.tag} is already blacklisted.`, ephemeral: true });
}

async function handleUnblacklist(interaction) {
  const user = interaction.options.getUser('user');
  db.removeFromBlacklist(interaction.guildId, user.id);
  return interaction.reply({ content: `\u2705 **${user.tag}** has been removed from the blacklist.` });
}
