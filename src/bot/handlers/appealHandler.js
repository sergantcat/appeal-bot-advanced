const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');
const db = require('../../database');
const { createAppealPanelEmbed, createAppealEmbed, createLogEmbed } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

const BUTTON_STYLES = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

function buildPanelButtons(appealTypes) {
  const rows = [];
  let currentRow = new ActionRowBuilder();
  let count = 0;

  for (const type of appealTypes.filter(t => t.enabled)) {
    if (count >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
      count = 0;
    }

    const btn = new ButtonBuilder()
      .setCustomId(`appeal_start_${type.type_key}`)
      .setLabel(type.label)
      .setStyle(BUTTON_STYLES[type.button_style] || ButtonStyle.Primary);

    if (type.emoji) {
      btn.setEmoji(type.emoji);
    }

    currentRow.addComponents(btn);
    count++;
  }

  if (count > 0) rows.push(currentRow);
  return rows;
}

function buildStaffButtons(appealId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_claim_${appealId}`)
      .setLabel('Claim')
      .setEmoji('\u{1F464}')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_approve_${appealId}`)
      .setLabel('Approve')
      .setEmoji('\u2705')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`appeal_deny_${appealId}`)
      .setLabel('Deny')
      .setEmoji('\u274C')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`appeal_escalate_${appealId}`)
      .setLabel('Escalate')
      .setEmoji('\u26A0\uFE0F')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_note_${appealId}`)
      .setLabel('Add Note')
      .setEmoji('\u{1F4DD}')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_evidence_${appealId}`)
      .setLabel('Request Evidence')
      .setEmoji('\u{1F4CE}')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_priority_${appealId}`)
      .setLabel('Set Priority')
      .setEmoji('\u{1F6A8}')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_close_${appealId}`)
      .setLabel('Close')
      .setEmoji('\u{1F512}')
      .setStyle(ButtonStyle.Danger),
  );

  return [row1, row2];
}

async function handleAppealButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('appeal_start_')) {
    const typeKey = customId.replace('appeal_start_', '');
    await handleStartAppeal(interaction, typeKey);
  } else if (customId.startsWith('appeal_claim_')) {
    await handleClaimAppeal(interaction);
  } else if (customId.startsWith('appeal_approve_')) {
    await handleApproveAppeal(interaction);
  } else if (customId.startsWith('appeal_deny_')) {
    await handleDenyAppeal(interaction);
  } else if (customId.startsWith('appeal_escalate_')) {
    await handleEscalateAppeal(interaction);
  } else if (customId.startsWith('appeal_note_')) {
    await handleAddNote(interaction);
  } else if (customId.startsWith('appeal_evidence_')) {
    await handleRequestEvidence(interaction);
  } else if (customId.startsWith('appeal_priority_')) {
    await handleSetPriority(interaction);
  } else if (customId.startsWith('appeal_close_')) {
    await handleCloseAppeal(interaction);
  }
}

async function handleStartAppeal(interaction, typeKey) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  // Check blacklist
  if (db.isBlacklisted(guildId, userId)) {
    return interaction.reply({
      content: '\u274C You are blacklisted from submitting appeals.',
      ephemeral: true,
    });
  }

  const settings = db.getGuildSettings(guildId);
  if (!settings) {
    return interaction.reply({
      content: '\u274C Appeal system not configured. Please ask an admin to set up the bot.',
      ephemeral: true,
    });
  }

  // Check cooldown
  const lastTime = db.getUserLastAppealTime(guildId, userId);
  const cooldownMs = (settings.cooldown_seconds || 600) * 1000;
  if (lastTime && Date.now() - lastTime < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (Date.now() - lastTime)) / 1000 / 60);
    return interaction.reply({
      content: `\u23F3 Please wait **${remaining} minutes** before submitting another appeal.`,
      ephemeral: true,
    });
  }

  // Check max active appeals
  const activeCount = db.getActiveAppealCount(guildId, userId);
  if (activeCount >= (settings.max_active_appeals || 3)) {
    return interaction.reply({
      content: `\u274C You have reached the maximum of **${settings.max_active_appeals || 3}** active appeals.`,
      ephemeral: true,
    });
  }

  const appealType = db.getAppealTypeByKey(guildId, typeKey);
  if (!appealType) {
    return interaction.reply({
      content: '\u274C This appeal type is not available.',
      ephemeral: true,
    });
  }

  // Get questions for this appeal type
  const questions = db.getQuestions(appealType.id);

  if (questions.length === 0) {
    // Default questions
    const modal = new ModalBuilder()
      .setCustomId(`appeal_submit_${typeKey}`)
      .setTitle(`${appealType.label} Appeal`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why were you punished?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1024)
          .setPlaceholder('Explain the reason for your punishment...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('appeal_text')
          .setLabel('Why should we accept your appeal?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1024)
          .setPlaceholder('Make your case for why you should be unbanned/unpunished...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('additional')
          .setLabel('Additional information')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1024)
          .setPlaceholder('Any extra evidence, links, or context...')
      ),
    );

    return interaction.showModal(modal);
  }

  // Custom questions (up to 5 due to Discord modal limit)
  const modal = new ModalBuilder()
    .setCustomId(`appeal_submit_${typeKey}`)
    .setTitle(`${appealType.label} Appeal`);

  const limitedQuestions = questions.slice(0, 5);
  for (const q of limitedQuestions) {
    const input = new TextInputBuilder()
      .setCustomId(`q_${q.id}`)
      .setLabel(q.question_label.substring(0, 45))
      .setStyle(q.question_style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required === 1)
      .setMaxLength(q.max_length || 1024);

    if (q.question_placeholder) {
      input.setPlaceholder(q.question_placeholder.substring(0, 100));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  if (!interaction.customId.startsWith('appeal_submit_')) return false;

  const typeKey = interaction.customId.replace('appeal_submit_', '');
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const appealType = db.getAppealTypeByKey(guildId, typeKey);
  if (!appealType) {
    return interaction.reply({ content: '\u274C Appeal type not found.', ephemeral: true });
  }

  const settings = db.getGuildSettings(guildId);

  // Collect responses
  const responses = {};
  for (const component of interaction.components) {
    for (const field of component.components) {
      const questions = db.getQuestions(appealType.id);
      const question = questions.find(q => `q_${q.id}` === field.customId);
      const label = question ? question.question_label : field.customId.replace('q_', '').replace(/_/g, ' ');
      responses[label] = field.value;
    }
  }

  // Create appeal in database
  const appeal = db.createAppeal({
    guild_id: guildId,
    user_id: userId,
    user_tag: interaction.user.tag,
    appeal_type: typeKey,
    responses: JSON.stringify(responses),
  });

  // Log creation
  db.addAppealLog({
    appeal_id: appeal.id,
    guild_id: guildId,
    action: 'created',
    actor_id: userId,
    actor_tag: interaction.user.tag,
    details: `${appealType.label} appeal submitted`,
  });

  // Create thread if auto_thread is enabled
  const targetChannelId = appealType.channel_id || interaction.channelId;
  const targetChannel = interaction.guild.channels.cache.get(targetChannelId) || interaction.channel;

  let thread = null;
  if (settings && settings.auto_thread) {
    try {
      thread = await targetChannel.threads.create({
        name: `\u{1F4CB} Appeal #${appeal.id} - ${interaction.user.username}`,
        type: ChannelType.PrivateThread,
        reason: `Appeal #${appeal.id} by ${interaction.user.tag}`,
      });

      // Update appeal with thread ID
      db.updateAppeal(appeal.id, { thread_id: thread.id });

      // Add the user to thread
      await thread.members.add(interaction.user.id);

      // Add staff role members
      if (settings.staff_role_id) {
        const staffRole = interaction.guild.roles.cache.get(settings.staff_role_id);
        if (staffRole) {
          for (const [, member] of staffRole.members) {
            try {
              await thread.members.add(member.id);
            } catch (e) {
              // Ignore if can't add
            }
          }
        }
      }

      // Send appeal embed in thread
      const parsedResponses = responses;
      const embed = createAppealEmbed(appeal, parsedResponses);
      const staffButtons = buildStaffButtons(appeal.id);
      await thread.send({ embeds: [embed], components: staffButtons });
    } catch (error) {
      console.error('Error creating appeal thread:', error);
    }
  }

  // Send to log channel
  if (settings && settings.log_channel_id) {
    const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
    if (logChannel) {
      const logEmbed = createLogEmbed('created', appeal, userId, `New ${appealType.label} appeal submitted`);
      try {
        await logChannel.send({ embeds: [logEmbed] });
      } catch (e) {
        console.error('Error sending log:', e);
      }
    }
  }

  // DM notification
  if (settings && settings.dm_notifications) {
    try {
      await interaction.user.send({
        embeds: [
          createAppealEmbed(appeal, responses)
            .setTitle(`\u{1F4E8} Appeal #${appeal.id} Submitted`)
            .setDescription(`Your **${appealType.label}** appeal has been submitted successfully.\n\nYou will be notified when a staff member reviews your appeal.`)
        ],
      });
    } catch (e) {
      // User has DMs disabled
    }
  }

  // Auto response
  const autoResp = db.getAutoResponse(guildId, 'pending', typeKey);
  if (autoResp && autoResp.message_template) {
    const message = autoResp.message_template
      .replace(/{user}/g, interaction.user.toString())
      .replace(/{appeal_id}/g, appeal.id)
      .replace(/{type}/g, appealType.label);

    if (thread) {
      try {
        await thread.send(message);
      } catch (e) {
        // Ignore
      }
    }
  }

  await interaction.reply({
    content: `\u2705 Your **${appealType.label}** appeal has been submitted successfully! (Appeal #${appeal.id})`,
    ephemeral: true,
  });

  return true;
}

async function handleClaimAppeal(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const appeal = db.getAppeal(appealId);
  if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

  if (appeal.claimed_by && appeal.claimed_by !== interaction.user.id) {
    return interaction.reply({ content: `\u274C This appeal is already claimed by <@${appeal.claimed_by}>.`, ephemeral: true });
  }

  db.updateAppeal(appealId, {
    claimed_by: interaction.user.id,
    claimed_by_tag: interaction.user.tag,
    status: 'under_review',
  });

  db.addAppealLog({
    appeal_id: appealId,
    guild_id: interaction.guildId,
    action: 'claimed',
    actor_id: interaction.user.id,
    actor_tag: interaction.user.tag,
    details: 'Appeal claimed for review',
  });

  await sendLogUpdate(interaction, appealId, 'claimed', 'Appeal claimed for review');

  await interaction.reply({
    content: `\u{1F464} **${interaction.user.tag}** has claimed Appeal #${appealId} and is now reviewing it.`,
  });
}

async function handleApproveAppeal(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const modal = new ModalBuilder()
    .setCustomId(`appeal_approve_modal_${appealId}`)
    .setTitle('Approve Appeal')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('resolution')
          .setLabel('Resolution notes (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Enter any resolution notes...')
      )
    );

  return interaction.showModal(modal);
}

async function handleDenyAppeal(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const modal = new ModalBuilder()
    .setCustomId(`appeal_deny_modal_${appealId}`)
    .setTitle('Deny Appeal')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('denial_reason')
          .setLabel('Reason for denial')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Provide a reason for denying this appeal...')
      )
    );

  return interaction.showModal(modal);
}

async function handleEscalateAppeal(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const appeal = db.getAppeal(appealId);
  if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

  db.updateAppeal(appealId, { status: 'escalated' });

  db.addAppealLog({
    appeal_id: appealId,
    guild_id: interaction.guildId,
    action: 'escalated',
    actor_id: interaction.user.id,
    actor_tag: interaction.user.tag,
    details: 'Appeal escalated to senior staff',
  });

  await sendLogUpdate(interaction, appealId, 'escalated', 'Appeal escalated to senior staff');
  await sendDMUpdate(interaction, appeal, 'escalated', 'Your appeal has been escalated to senior staff for further review.');

  await interaction.reply({
    content: `\u26A0\uFE0F Appeal #${appealId} has been **escalated** to senior staff by ${interaction.user.tag}.`,
  });
}

async function handleAddNote(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const modal = new ModalBuilder()
    .setCustomId(`appeal_note_modal_${appealId}`)
    .setTitle('Add Staff Note')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Note')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Enter your staff note...')
      )
    );

  return interaction.showModal(modal);
}

async function handleRequestEvidence(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const appeal = db.getAppeal(appealId);
  if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

  db.addAppealLog({
    appeal_id: appealId,
    guild_id: interaction.guildId,
    action: 'evidence_requested',
    actor_id: interaction.user.id,
    actor_tag: interaction.user.tag,
    details: 'Evidence requested from appellant',
  });

  await sendDMUpdate(interaction, appeal, 'evidence_requested',
    'A staff member has requested additional evidence for your appeal. Please provide any screenshots, links, or other evidence in the appeal thread.');

  await interaction.reply({
    content: `\u{1F4CE} Evidence has been requested from <@${appeal.user_id}> for Appeal #${appealId}.`,
  });
}

async function handleSetPriority(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_priority_set_${appealId}_low`)
      .setLabel('Low')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_priority_set_${appealId}_normal`)
      .setLabel('Normal')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`appeal_priority_set_${appealId}_high`)
      .setLabel('High')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`appeal_priority_set_${appealId}_urgent`)
      .setLabel('Urgent')
      .setEmoji('\u{1F6A8}')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({
    content: `Select priority for Appeal #${appealId}:`,
    components: [row],
    ephemeral: true,
  });
}

async function handlePrioritySet(interaction) {
  const parts = interaction.customId.split('_');
  const priority = parts.pop();
  const appealId = parseInt(parts.pop());

  db.updateAppeal(appealId, { priority });

  db.addAppealLog({
    appeal_id: appealId,
    guild_id: interaction.guildId,
    action: 'priority_changed',
    actor_id: interaction.user.id,
    actor_tag: interaction.user.tag,
    details: `Priority set to ${priority}`,
  });

  await interaction.update({
    content: `\u{1F6A8} Priority for Appeal #${appealId} set to **${priority.toUpperCase()}**.`,
    components: [],
  });
}

async function handleCloseAppeal(interaction) {
  if (!isStaff(interaction.member, interaction.guildId)) {
    return interaction.reply({ content: '\u274C You do not have permission to do this.', ephemeral: true });
  }

  const appealId = parseInt(interaction.customId.split('_').pop());
  const appeal = db.getAppeal(appealId);
  if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

  db.updateAppeal(appealId, { status: 'closed', closed_at: new Date().toISOString() });

  db.addAppealLog({
    appeal_id: appealId,
    guild_id: interaction.guildId,
    action: 'closed',
    actor_id: interaction.user.id,
    actor_tag: interaction.user.tag,
    details: 'Appeal closed',
  });

  await sendLogUpdate(interaction, appealId, 'closed', 'Appeal closed');

  await interaction.reply({
    content: `\u{1F512} Appeal #${appealId} has been **closed** by ${interaction.user.tag}.`,
  });
}

async function handleStaffModalSubmit(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('appeal_approve_modal_')) {
    const appealId = parseInt(customId.replace('appeal_approve_modal_', ''));
    const appeal = db.getAppeal(appealId);
    if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

    const resolution = interaction.fields.getTextInputValue('resolution') || '';

    db.updateAppeal(appealId, {
      status: 'approved',
      resolution_notes: resolution,
      closed_at: new Date().toISOString(),
    });

    db.addAppealLog({
      appeal_id: appealId,
      guild_id: interaction.guildId,
      action: 'approved',
      actor_id: interaction.user.id,
      actor_tag: interaction.user.tag,
      details: resolution || 'Appeal approved',
    });

    await sendLogUpdate(interaction, appealId, 'approved', resolution || 'Appeal approved');
    await sendDMUpdate(interaction, appeal, 'approved',
      `Your appeal has been **approved**!${resolution ? `\n\n**Notes:** ${resolution}` : ''}`);

    // Auto response
    const autoResp = db.getAutoResponse(interaction.guildId, 'approved', appeal.appeal_type);
    if (autoResp && autoResp.message_template) {
      const message = autoResp.message_template
        .replace(/{user}/g, `<@${appeal.user_id}>`)
        .replace(/{appeal_id}/g, appeal.id)
        .replace(/{staff}/g, interaction.user.toString());
      try {
        if (appeal.thread_id) {
          const thread = interaction.guild.channels.cache.get(appeal.thread_id);
          if (thread) await thread.send(message);
        }
      } catch (e) { /* ignore */ }
    }

    return interaction.reply({
      content: `\u2705 Appeal #${appealId} has been **approved** by ${interaction.user.tag}.`,
    });
  }

  if (customId.startsWith('appeal_deny_modal_')) {
    const appealId = parseInt(customId.replace('appeal_deny_modal_', ''));
    const appeal = db.getAppeal(appealId);
    if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

    const denialReason = interaction.fields.getTextInputValue('denial_reason');

    db.updateAppeal(appealId, {
      status: 'denied',
      denial_reason: denialReason,
      closed_at: new Date().toISOString(),
    });

    db.addAppealLog({
      appeal_id: appealId,
      guild_id: interaction.guildId,
      action: 'denied',
      actor_id: interaction.user.id,
      actor_tag: interaction.user.tag,
      details: denialReason,
    });

    await sendLogUpdate(interaction, appealId, 'denied', denialReason);
    await sendDMUpdate(interaction, appeal, 'denied',
      `Your appeal has been **denied**.\n\n**Reason:** ${denialReason}`);

    // Auto response
    const autoResp = db.getAutoResponse(interaction.guildId, 'denied', appeal.appeal_type);
    if (autoResp && autoResp.message_template) {
      const message = autoResp.message_template
        .replace(/{user}/g, `<@${appeal.user_id}>`)
        .replace(/{appeal_id}/g, appeal.id)
        .replace(/{staff}/g, interaction.user.toString())
        .replace(/{reason}/g, denialReason);
      try {
        if (appeal.thread_id) {
          const thread = interaction.guild.channels.cache.get(appeal.thread_id);
          if (thread) await thread.send(message);
        }
      } catch (e) { /* ignore */ }
    }

    return interaction.reply({
      content: `\u274C Appeal #${appealId} has been **denied** by ${interaction.user.tag}.`,
    });
  }

  if (customId.startsWith('appeal_note_modal_')) {
    const appealId = parseInt(customId.replace('appeal_note_modal_', ''));
    const appeal = db.getAppeal(appealId);
    if (!appeal) return interaction.reply({ content: '\u274C Appeal not found.', ephemeral: true });

    const note = interaction.fields.getTextInputValue('note');
    const existingNotes = appeal.staff_notes || '';
    const newNotes = `${existingNotes}\n[${new Date().toISOString()}] ${interaction.user.tag}: ${note}`.trim();

    db.updateAppeal(appealId, { staff_notes: newNotes });

    db.addAppealLog({
      appeal_id: appealId,
      guild_id: interaction.guildId,
      action: 'note_added',
      actor_id: interaction.user.id,
      actor_tag: interaction.user.tag,
      details: note,
    });

    return interaction.reply({
      content: `\u{1F4DD} Note added to Appeal #${appealId} by ${interaction.user.tag}:\n> ${note}`,
    });
  }

  return false;
}

async function sendLogUpdate(interaction, appealId, action, details) {
  const appeal = db.getAppeal(appealId);
  const settings = db.getGuildSettings(interaction.guildId);
  if (!settings || !settings.log_channel_id) return;

  const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
  if (!logChannel) return;

  const logEmbed = createLogEmbed(action, appeal, interaction.user.id, details);
  try {
    await logChannel.send({ embeds: [logEmbed] });
  } catch (e) {
    console.error('Error sending log:', e);
  }
}

async function sendDMUpdate(interaction, appeal, action, message) {
  const settings = db.getGuildSettings(interaction.guildId);
  if (!settings || !settings.dm_notifications) return;

  try {
    const user = await interaction.client.users.fetch(appeal.user_id);
    if (user) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor(action === 'approved' ? 0x2ECC71 : action === 'denied' ? 0xE74C3C : 0x5865F2)
        .setTitle(`\u{1F4E8} Appeal #${appeal.id} Update`)
        .setDescription(message)
        .setTimestamp()
        .setFooter({ text: interaction.guild.name });
      await user.send({ embeds: [embed] });
    }
  } catch (e) {
    // DMs disabled
  }
}

module.exports = {
  buildPanelButtons,
  buildStaffButtons,
  handleAppealButton,
  handleModalSubmit,
  handleStaffModalSubmit,
  handlePrioritySet,
};
