#!/usr/bin/env node

const config = require('./config');
const DiscordNotifier = require('./services/discordNotifier');

async function testDiscordConnection() {
  console.log('🔗 Testing Discord Connection');
  console.log('='.repeat(40));
  
  // Check config
  console.log('📋 Configuration:');
  console.log(`   Bot token: ${config.discord.botToken ? 'Set' : 'Missing'}`);
  console.log(`   Channel ID: ${config.discord.channelId ? 'Set' : 'Missing'}`);
  console.log(`   NFTs Role ID: ${config.discord.nftsRoleId ? 'Set' : 'Missing'}`);
  
  if (!config.discord.botToken || !config.discord.channelId) {
    console.log('❌ Missing required Discord configuration');
    return;
  }
  
  try {
    console.log('\n🔗 Attempting to connect to Discord...');
    const notifier = new DiscordNotifier();
    
    // Test connection
    await notifier.connect();
    console.log('✅ Discord connection successful!');
    
    // Test if bot is ready
    if (notifier.isReady) {
      console.log('✅ Bot is ready to send notifications');
    } else {
      console.log('⚠️ Bot is not ready yet');
    }
    
    // Test channel access
    try {
      const channel = await notifier.client.channels.fetch(config.discord.channelId);
      if (channel) {
        console.log(`✅ Channel access successful: #${channel.name}`);
      } else {
        console.log('❌ Channel not found');
      }
    } catch (error) {
      console.log('❌ Channel access failed:', error.message);
    }
    
    // Test sending a simple message
    try {
      const testEmbed = {
        title: '🤖 Bot Connection Test',
        description: 'This is a test message to verify the bot is working correctly.',
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'NFT Tracker Bot Test'
        }
      };
      
      await notifier.sendNotification({
        type: 'test',
        walletName: 'Test Wallet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        tokenName: 'Test NFT',
        tokenId: '1',
        contractAddress: '0x1234567890123456789012345678901234567890',
        transactionHash: '0x1234567890123456789012345678901234567890',
        chainName: 'Ethereum',
        timestamp: Date.now(),
        price: 0.1,
        priceUSD: 200
      });
      
      console.log('✅ Test notification sent successfully!');
    } catch (error) {
      console.log('❌ Test notification failed:', error.message);
    }
    
    // Cleanup
    await notifier.disconnect();
    console.log('🔌 Discord connection closed');
    
  } catch (error) {
    console.error('❌ Discord connection test failed:', error.message);
    
    if (error.message.includes('token')) {
      console.log('💡 Check your DISCORD_BOT_TOKEN environment variable');
    } else if (error.message.includes('channel')) {
      console.log('💡 Check your DISCORD_CHANNEL_ID environment variable');
    } else if (error.message.includes('permissions')) {
      console.log('💡 Check bot permissions in Discord server');
    }
  }
  
  console.log('\n' + '='.repeat(40));
}

// Run the test
testDiscordConnection().catch(console.error);
