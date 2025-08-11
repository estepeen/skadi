const { Collection } = require('discord.js');
const CollectionCommand = require('./collectionCommand');

class CommandManager {
  constructor() {
    this.commands = new Collection();
    this.initializeCommands();
  }

  initializeCommands() {
    // Register collection command
    const collectionCommand = new CollectionCommand();
    this.commands.set(collectionCommand.getCommandData().name, collectionCommand);
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
