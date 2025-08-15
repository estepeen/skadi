const { Collection, MessageFlags } = require('discord.js');
const CollectionCommand = require('./collectionCommand');
const AlertsCommand = require('./alertsCommand');

class CommandManager {
  constructor() {
    this.commands = new Collection();
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.initializeCommands();
      this.initialized = true;
    }
    return this.initialized;
  }

  async initializeCommands() {
    // Register collection command
    const collectionCommand = new CollectionCommand();
    this.commands.set(collectionCommand.getCommandData().name, collectionCommand);

    // Register alerts command and initialize its database
    const alertsCommand = new AlertsCommand();
    await alertsCommand.initialize();
    this.commands.set(alertsCommand.getCommandData().name, alertsCommand);
  }

  getCommands() {
    return Array.from(this.commands.values()).map(command => command.getCommandData().toJSON());
  }

  async executeCommand(interaction) {
    const commandName = interaction.commandName;
    let command = this.commands.get(commandName);

    if (!command) {
      // Try lazy initialization in case commands were not ready yet
      try {
        if (!this.initialized) {
          console.log('⚠️ Commands not initialized yet. Initializing now...');
          await this.initialize();
          command = this.commands.get(commandName);
        }
      } catch (e) {
        console.error('❌ Failed to initialize commands on-demand:', e.message);
      }
    }

    if (!command) {
      const available = Array.from(this.commands.keys());
      console.error(`❌ Unknown command: ${commandName}. Available: ${available.join(', ') || '(none)'}`);
      try {
        await interaction.reply({ content: '⚠️ Commands are updating. Please try again in a moment.', flags: MessageFlags.Ephemeral });
      } catch {}
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error executing command ${commandName}:`, error);
      
      const errorMessage = '❌ Došlo k neočekávané chybě při spuštění příkazu.';
      
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }

  async cleanup() {
    for (const command of this.commands.values()) {
      if (command.disconnect) {
        await command.disconnect();
      }
    }
  }
}

module.exports = CommandManager;
