#!/usr/bin/env node

const config = require('./config');
const DiscordNotifier = require('./services/discordNotifier');
const registry = require('./services/registry');

let notifier = null;

async function startDiscordBot() {
  console.log('🤖 Starting Discord Bot with Slash Commands...');
  console.log('='.repeat(50));

  try {
    // Create Discord notifier instance
    notifier = new DiscordNotifier();
    registry.setDiscordNotifier(notifier);
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

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  // Log the stack only — discord.js API errors carry a `requestBody` holding the
  // full outgoing JSON payload, which the whole-object form would dump.
  console.error('❌ Uncaught exception:', error?.stack ?? error);
  process.exit(1);
});

// Start the bot
startDiscordBot();
