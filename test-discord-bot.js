const { Client, GatewayIntentBits, Events } = require('discord.js');
const config = require('./config');
const CommandManager = require('./services/commandManager');

async function testDiscordBot() {
  try {
    console.log('🤖 Testing Discord Bot with Slash Commands...');
    console.log('='.repeat(50));
    
    // Create Discord client
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    // Create command manager
    const commandManager = new CommandManager();
    
    // Setup event handlers
    client.once('ready', async () => {
      console.log(`✅ Discord bot logged in as ${client.user.tag}`);
      
      try {
        console.log('🔧 Registering slash commands...');
        
        // Get all commands from command manager
        const commands = commandManager.getCommands();
        
        // Register commands globally
        const result = await client.application.commands.set(commands);
        
        console.log(`✅ Successfully registered ${result.size} slash commands:`);
        result.forEach(command => {
          console.log(`   /${command.name}: ${command.description}`);
        });
        
        console.log('\n🎉 Bot is ready! You can now use /collection command in Discord.');
        console.log('💡 Keep this terminal open to keep the bot running.');
        console.log('🛑 Press Ctrl+C to stop the bot.');
        
      } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
      }
    });
    
    // Handle slash command interactions
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      
      try {
        await commandManager.executeCommand(interaction);
      } catch (error) {
        console.error('❌ Error handling interaction:', error);
      }
    });
    
    // Handle errors
    client.on('error', (error) => {
      console.error('❌ Discord bot error:', error);
    });
    
    // Login to Discord
    console.log('🔗 Connecting to Discord...');
    await client.login(config.discord.botToken);
    
  } catch (error) {
    console.error('❌ Error starting Discord bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Discord Bot...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down Discord Bot...');
  process.exit(0);
});

// Start the bot
testDiscordBot();
