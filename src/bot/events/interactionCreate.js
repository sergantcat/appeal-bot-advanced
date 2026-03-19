const { handleAppealButton, handleModalSubmit, handleStaffModalSubmit, handlePrioritySet } = require('../handlers/appealHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[BOT] Error executing command ${interaction.commandName}:`, error);
        const reply = {
          content: '\u274C An error occurred while executing this command.',
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      try {
        if (interaction.customId.startsWith('appeal_priority_set_')) {
          return handlePrioritySet(interaction);
        }
        if (interaction.customId.startsWith('appeal_')) {
          return handleAppealButton(interaction);
        }
      } catch (error) {
        console.error('[BOT] Error handling button:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '\u274C An error occurred.', ephemeral: true });
        }
      }
      return;
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      try {
        if (interaction.customId.startsWith('appeal_submit_')) {
          return handleModalSubmit(interaction);
        }
        if (interaction.customId.startsWith('appeal_approve_modal_') ||
            interaction.customId.startsWith('appeal_deny_modal_') ||
            interaction.customId.startsWith('appeal_note_modal_')) {
          return handleStaffModalSubmit(interaction);
        }
      } catch (error) {
        console.error('[BOT] Error handling modal:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '\u274C An error occurred.', ephemeral: true });
        }
      }
    }
  },
};
