#!/usr/bin/env node

const config = require('./config');
const DiscordNotifier = require('./services/discordNotifier');

async function startDiscordBot() {
  console.log('🤖 Starting Discord Bot with Slash Commands...');
  console.log('='.repeat(50));
  
  let notifier;
  
  try {
    // Create Discord notifier instance
    notifier = new DiscordNotifier();
    console.log('✅ DiscordNotifier instance created');
    
    // Connect to Discord
    console.log('🔗 Connecting to Discord...');
    await notifier.connect();
    console.log('✅ Connected to Discord successfully');
    
    // Keep the bot running
    console.log('\n🎉 Discord Bot is now running!');
    console.log('💡 You can now use /collection command in Discord');
    console.log('🛑 Press Ctrl+C to stop the bot');
    console.log('='.repeat(50));
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Error starting Discord bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Discord Bot...');
  if (notifier) {
    await notifier.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down Discord Bot...');
  if (notifier) {
    await notifier.disconnect();
  }
  process.exit(0);
});

// Start the bot
startDiscordBot();
