const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { buildPanelButtons } = require('../handlers/appealHandler');
const { createAppealPanelEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up appeal panels in the current channel or a specific appeal type channel')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Deploy a specific appeal type panel (leave empty for all)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const typeFilter = interaction.options.getString('type');

    // Ensure guild settings exist
    db.upsertGuildSettings(guildId, {
      guild_name: interaction.guild.name,
      guild_icon: interaction.guild.iconURL() || '',
    });

    const appealTypes = db.getAppealTypes(guildId);

    if (appealTypes.length === 0) {
      // Create default appeal types
      const defaults = [
        { type_key: 'security', label: 'Security', emoji: '\u{1F6E1}\uFE0F', color: '#E74C3C', button_style: 'DANGER', sort_order: 0,
          embed_title: '\u{1F6E1}\uFE0F Security Appeals', embed_description: 'If you believe your security-related punishment was unjust, submit an appeal below.\n\n**Guidelines:**\n\u2022 Provide your account details\n\u2022 Explain the situation truthfully\n\u2022 Include any supporting evidence\n\u2022 Appeals are reviewed within 24-48 hours', embed_color: '#E74C3C' },
        { type_key: 'raider', label: 'Raider', emoji: '\u2694\uFE0F', color: '#E67E22', button_style: 'DANGER', sort_order: 1,
          embed_title: '\u2694\uFE0F Raider Appeals', embed_description: 'If you were flagged as a raider and believe this was a mistake, submit your appeal below.\n\n**Guidelines:**\n\u2022 Explain why you were in the server\n\u2022 Provide evidence of legitimate membership\n\u2022 Do not attempt to bypass bans\n\u2022 False appeals will result in permanent blacklist', embed_color: '#E67E22' },
        { type_key: 'game', label: 'Game', emoji: '\u{1F3AE}', color: '#3498DB', button_style: 'PRIMARY', sort_order: 2,
          embed_title: '\u{1F3AE} Game Appeals', embed_description: 'Appeal a game-related ban or punishment here.\n\n**Guidelines:**\n\u2022 Specify which game and server\n\u2022 Explain the incident that led to your ban\n\u2022 Provide screenshots or video evidence if possible\n\u2022 Be honest - dishonesty leads to automatic denial', embed_color: '#3498DB' },
        { type_key: 'other', label: 'Other', emoji: '\u{1F4CB}', color: '#9B59B6', button_style: 'SECONDARY', sort_order: 3,
          embed_title: '\u{1F4CB} Other Appeals', embed_description: 'For any appeal that doesn\'t fit the other categories.\n\n**Guidelines:**\n\u2022 Clearly state the type of punishment\n\u2022 Provide full context of the situation\n\u2022 Be respectful and patient\n\u2022 Staff will review as soon as possible', embed_color: '#9B59B6' },
      ];

      for (const def of defaults) {
        db.createAppealType({ guild_id: guildId, ...def });

        // Create default questions for each type
        const appealType = db.getAppealTypeByKey(guildId, def.type_key);
        if (appealType) {
          db.createQuestion({ appeal_type_id: appealType.id, question_label: 'What is your username/ID?', question_placeholder: 'Enter your username or user ID...', question_style: 'short', required: 1, sort_order: 0 });
          db.createQuestion({ appeal_type_id: appealType.id, question_label: 'Why were you punished?', question_placeholder: 'Describe the reason for your punishment...', question_style: 'paragraph', required: 1, sort_order: 1 });
          db.createQuestion({ appeal_type_id: appealType.id, question_label: 'Why should we accept your appeal?', question_placeholder: 'Make your case...', question_style: 'paragraph', required: 1, sort_order: 2 });
          db.createQuestion({ appeal_type_id: appealType.id, question_label: 'Additional evidence or context', question_placeholder: 'Links, screenshots, or other info...', question_style: 'paragraph', required: 0, sort_order: 3 });
        }
      }
    }

    const allTypes = db.getAppealTypes(guildId);
    const enabledTypes = allTypes.filter(t => t.enabled);

    if (typeFilter) {
      // Deploy single appeal type panel
      const appealType = allTypes.find(t => t.type_key === typeFilter);
      if (!appealType) {
        return interaction.editReply({ content: `\u274C Appeal type "${typeFilter}" not found. Available types: ${allTypes.map(t => t.type_key).join(', ')}` });
      }

      const embed = createAppealPanelEmbed(appealType);
      const buttons = buildPanelButtons([appealType]);
      await interaction.channel.send({ embeds: [embed], components: buttons });
      return interaction.editReply({ content: `\u2705 ${appealType.label} appeal panel deployed!` });
    }

    // Deploy all panels
    for (const type of enabledTypes) {
      const embed = createAppealPanelEmbed(type);
      const buttons = buildPanelButtons([type]);
      await interaction.channel.send({ embeds: [embed], components: buttons });
    }

    return interaction.editReply({ content: `\u2705 All appeal panels deployed! (${enabledTypes.length} types)` });
  },
};
