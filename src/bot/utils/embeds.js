const { EmbedBuilder } = require('discord.js');

const STATUS_COLORS = {
  pending: 0xFFA500,
  under_review: 0x3498DB,
  approved: 0x2ECC71,
  denied: 0xE74C3C,
  escalated: 0x9B59B6,
  closed: 0x95A5A6,
};

const STATUS_EMOJIS = {
  pending: '\u{1F4CB}',
  under_review: '\u{1F50D}',
  approved: '\u2705',
  denied: '\u274C',
  escalated: '\u26A0\uFE0F',
  closed: '\u{1F512}',
};

function createAppealPanelEmbed(appealType) {
  const color = parseInt((appealType.embed_color || appealType.color || '#5865F2').replace('#', ''), 16);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(appealType.embed_title || `${appealType.emoji || '\u{1F4DD}'} ${appealType.label} Appeals`)
    .setDescription(
      appealType.embed_description ||
      `Submit a **${appealType.label}** appeal by clicking the button below.\n\n` +
      `**Please note:**\n` +
      `\u2022 Be honest and detailed in your responses\n` +
      `\u2022 False information will result in automatic denial\n` +
      `\u2022 You will be notified of the decision via DM\n` +
      `\u2022 Do not spam appeals - cooldowns apply`
    )
    .setTimestamp();

  if (appealType.embed_thumbnail) {
    embed.setThumbnail(appealType.embed_thumbnail);
  }

  if (appealType.embed_image) {
    embed.setImage(appealType.embed_image);
  }

  if (appealType.embed_footer) {
    embed.setFooter({ text: appealType.embed_footer });
  } else {
    embed.setFooter({ text: `${appealType.label} Appeal System` });
  }

  return embed;
}

function createAppealEmbed(appeal, responses) {
  const color = STATUS_COLORS[appeal.status] || 0x5865F2;
  const emoji = STATUS_EMOJIS[appeal.status] || '\u{1F4DD}';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} Appeal #${appeal.id} - ${appeal.appeal_type.charAt(0).toUpperCase() + appeal.appeal_type.slice(1)}`)
    .setDescription(`**Status:** ${formatStatus(appeal.status)}\n**Submitted by:** <@${appeal.user_id}> (${appeal.user_tag})`)
    .setTimestamp(new Date(appeal.created_at));

  if (responses && typeof responses === 'object') {
    for (const [question, answer] of Object.entries(responses)) {
      embed.addFields({ name: question, value: answer || 'No response', inline: false });
    }
  }

  if (appeal.claimed_by) {
    embed.addFields({ name: '\u{1F464} Claimed By', value: `<@${appeal.claimed_by}>`, inline: true });
  }

  if (appeal.priority !== 'normal') {
    embed.addFields({ name: '\u{1F6A8} Priority', value: appeal.priority.toUpperCase(), inline: true });
  }

  embed.setFooter({ text: `Appeal ID: ${appeal.id} | Type: ${appeal.appeal_type}` });

  return embed;
}

function createLogEmbed(action, appeal, actor, details) {
  const colors = {
    created: 0x3498DB,
    claimed: 0xF39C12,
    approved: 0x2ECC71,
    denied: 0xE74C3C,
    escalated: 0x9B59B6,
    note_added: 0x1ABC9C,
    closed: 0x95A5A6,
    reopened: 0x3498DB,
    priority_changed: 0xE67E22,
  };

  const emojis = {
    created: '\u{1F4E5}',
    claimed: '\u{1F464}',
    approved: '\u2705',
    denied: '\u274C',
    escalated: '\u26A0\uFE0F',
    note_added: '\u{1F4DD}',
    closed: '\u{1F512}',
    reopened: '\u{1F513}',
    priority_changed: '\u{1F6A8}',
  };

  const embed = new EmbedBuilder()
    .setColor(colors[action] || 0x5865F2)
    .setTitle(`${emojis[action] || '\u{1F4CB}'} Appeal #${appeal.id} - ${action.replace('_', ' ').toUpperCase()}`)
    .addFields(
      { name: 'Appeal Type', value: appeal.appeal_type, inline: true },
      { name: 'Status', value: formatStatus(appeal.status), inline: true },
      { name: 'User', value: `<@${appeal.user_id}>`, inline: true }
    )
    .setTimestamp();

  if (actor) {
    embed.addFields({ name: 'Action By', value: `<@${actor}>`, inline: true });
  }

  if (details) {
    embed.addFields({ name: 'Details', value: details, inline: false });
  }

  return embed;
}

function createStatsEmbed(stats, guildName) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`\u{1F4CA} Appeal Statistics - ${guildName || 'Server'}`)
    .addFields(
      { name: '\u{1F4CB} Total Appeals', value: `${stats.total}`, inline: true },
      { name: '\u{1F7E1} Pending', value: `${stats.pending}`, inline: true },
      { name: '\u{1F535} Under Review', value: `${stats.underReview}`, inline: true },
      { name: '\u{1F7E2} Approved', value: `${stats.approved}`, inline: true },
      { name: '\u{1F534} Denied', value: `${stats.denied}`, inline: true },
      { name: '\u{1F7E3} Escalated', value: `${stats.escalated}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Appeal Statistics' });

  if (stats.byType && stats.byType.length > 0) {
    const typeBreakdown = stats.byType
      .map(t => `**${t.appeal_type}**: ${t.count} total (${t.approved} approved, ${t.denied} denied)`)
      .join('\n');
    embed.addFields({ name: '\u{1F4CA} By Type', value: typeBreakdown, inline: false });
  }

  return embed;
}

function formatStatus(status) {
  const emoji = STATUS_EMOJIS[status] || '';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${emoji} ${label}`;
}

module.exports = {
  createAppealPanelEmbed,
  createAppealEmbed,
  createLogEmbed,
  createStatsEmbed,
  formatStatus,
  STATUS_COLORS,
  STATUS_EMOJIS,
};
