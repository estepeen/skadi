const { Collection } = require('discord.js');
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
    const command = this.commands.get(commandName);

    if (!command) {
      console.error(`❌ Unknown command: ${commandName}`);
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
        await interaction.reply({ content: errorMessage, ephemeral: true });
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
