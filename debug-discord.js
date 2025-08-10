#!/usr/bin/env node

const config = require('./config');
const DiscordNotifier = require('./services/discordNotifier');

async function debugDiscord() {
  console.log('🔍 Discord Debug Script');
  console.log('='.repeat(50));
  
  // 1. Check configuration
  console.log('📋 1. Configuration Check:');
  console.log(`   Bot Token: ${config.discord.botToken ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Channel ID: ${config.discord.channelId ? '✅ Set' : '❌ Missing'}`);
  console.log(`   NFTs Role ID: ${config.discord.nftsRoleId ? '✅ Set' : '❌ Missing'}`);
  
  if (!config.discord.botToken || !config.discord.channelId) {
    console.log('❌ Missing required Discord configuration!');
    return;
  }
  
  // 2. Test Discord connection
  console.log('\n🔗 2. Testing Discord Connection:');
  let notifier;
  try {
    notifier = new DiscordNotifier();
    console.log('✅ DiscordNotifier instance created');
    
    console.log('🔗 Attempting to connect...');
    await notifier.connect();
    console.log('✅ Connection successful');
    
    // 3. Check bot readiness
    console.log('\n🤖 3. Bot Readiness Check:');
    console.log(`   isReady: ${notifier.isReady ? '✅ Yes' : '❌ No'}`);
    console.log(`   Client ready: ${notifier.client.readyAt ? '✅ Yes' : '❌ No'}`);
    
    if (notifier.client.readyAt) {
      console.log(`   Ready since: ${notifier.client.readyAt}`);
    }
    
    // 4. Test channel access
    console.log('\n📺 4. Channel Access Test:');
    try {
      const channel = await notifier.client.channels.fetch(config.discord.channelId);
      if (channel) {
        console.log(`✅ Channel found: #${channel.name}`);
        console.log(`   Type: ${channel.type}`);
        console.log(`   Guild: ${channel.guild?.name || 'DM'}`);
        
        // Check permissions
        const permissions = channel.permissionsFor(notifier.client.user);
        if (permissions) {
          console.log('🔐 Bot permissions:');
          console.log(`   Send Messages: ${permissions.has('SendMessages') ? '✅' : '❌'}`);
          console.log(`   Embed Links: ${permissions.has('EmbedLinks') ? '✅' : '❌'}`);
          console.log(`   Attach Files: ${permissions.has('AttachFiles') ? '✅' : '❌'}`);
        }
      } else {
        console.log('❌ Channel not found');
      }
    } catch (error) {
      console.log('❌ Channel access failed:', error.message);
    }
    
    // 5. Test notification sending
    console.log('\n📨 5. Test Notification:');
    try {
      const testData = {
        type: 'purchase',
        walletName: 'Test Wallet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        tokenName: 'Test NFT',
        tokenId: '1',
        contractAddress: '0x1234567890123456789012345678901234567890',
        transactionHash: '0x1234567890123456789012345678901234567890',
        chainName: 'Ethereum',
        timestamp: Date.now(),
        price: 0.1,
        priceUSD: 200,
        quantity: 1
      };
      
      console.log('📤 Sending test notification...');
      await notifier.sendNotification(testData);
      console.log('✅ Test notification sent successfully!');
      
    } catch (error) {
      console.log('❌ Test notification failed:', error.message);
      console.log('   Error details:', error);
    }
    
    // 6. Check bot status in guild
    console.log('\n🏠 6. Bot Guild Status:');
    const guilds = notifier.client.guilds.cache;
    console.log(`   Connected to ${guilds.size} guild(s):`);
    
    guilds.forEach(guild => {
      console.log(`   - ${guild.name} (${guild.id})`);
      const member = guild.members.cache.get(notifier.client.user.id);
      if (member) {
        console.log(`     Roles: ${member.roles.cache.map(r => r.name).join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Discord debug failed:', error.message);
    console.log('   Full error:', error);
    
    if (error.message.includes('token')) {
      console.log('\n💡 Token issues:');
      console.log('   - Check if bot token is correct');
      console.log('   - Verify bot is not banned');
      console.log('   - Check if bot account is active');
    } else if (error.message.includes('permission')) {
      console.log('\n💡 Permission issues:');
      console.log('   - Check bot permissions in server');
      console.log('   - Verify bot has SendMessages permission');
    } else if (error.message.includes('network')) {
      console.log('\n💡 Network issues:');
      console.log('   - Check VPS internet connection');
      console.log('   - Verify Discord API is accessible');
    }
  } finally {
    // Cleanup
    if (notifier) {
      try {
        await notifier.disconnect();
        console.log('\n🔌 Discord connection closed');
      } catch (error) {
        console.log('⚠️ Error during disconnect:', error.message);
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 Debug complete! Check the output above for issues.');
}

// Run debug
debugDiscord().catch(console.error);
