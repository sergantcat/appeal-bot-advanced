const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { buildPanelButtons } = require('../handlers/appealHandler');
const { createAppealPanelEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deploy-panel')
    .setDescription('Deploy an appeal panel to a specific channel')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to deploy the panel to')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Appeal type to deploy (leave empty for all)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const typeFilter = interaction.options.getString('type');
    const guildId = interaction.guildId;

    const allTypes = db.getAppealTypes(guildId);
    if (allTypes.length === 0) {
      return interaction.editReply({ content: '\u274C No appeal types configured. Run `/setup` first or configure types in the dashboard.' });
    }

    if (typeFilter) {
      const appealType = allTypes.find(t => t.type_key === typeFilter);
      if (!appealType) {
        return interaction.editReply({ content: `\u274C Appeal type "${typeFilter}" not found.` });
      }

      const embed = createAppealPanelEmbed(appealType);
      const buttons = buildPanelButtons([appealType]);
      await channel.send({ embeds: [embed], components: buttons });
      return interaction.editReply({ content: `\u2705 ${appealType.label} appeal panel deployed to ${channel}!` });
    }

    const enabledTypes = allTypes.filter(t => t.enabled);
    for (const type of enabledTypes) {
      const embed = createAppealPanelEmbed(type);
      const buttons = buildPanelButtons([type]);
      await channel.send({ embeds: [embed], components: buttons });
    }

    return interaction.editReply({ content: `\u2705 All appeal panels deployed to ${channel}! (${enabledTypes.length} types)` });
  },
};
