const NFTTracker = require('./services/nftTracker');
const DiscordNotifier = require('./services/discordNotifier');
const config = require('./config');

async function testEnhancedVolumeNotifications() {
  console.log('🧪 Testing Enhanced Volume Notifications...\n');
  
  const nftTracker = new NFTTracker();
  const discordNotifier = new DiscordNotifier();
  
  // Test with THE DROPZONE collection from the image
  const testContract = '0x1234567890123456789012345678901234567890'; // Replace with actual contract
  const testSlug = 'dropzone-mcade';
  const chainName = 'Base';
  
  try {
    // Initialize Discord notifier
    if (config.discord.botToken && config.discord.channelId) {
      await discordNotifier.connect();
      console.log('✅ Discord notifier connected');
    } else {
      console.log('⚠️ Discord not configured, will only show notification preview');
    }
    
    // Get collection stats
    console.log('📊 Getting collection stats...');
    const stats = await nftTracker.getCollectionStats(testContract, chainName);
    
    if (stats) {
      console.log('✅ Stats retrieved successfully');
      
      // Create a mock transaction data object to test the notification
      const mockTransactionData = {
        type: 'purchase',
        walletName: 'TestWallet',
        walletAddress: '0x1234567890123456789012345678901234567890',
        fromAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        toAddress: '0x1234567890123456789012345678901234567890',
        tokenName: 'THE DROPZONE',
        tokenId: '0x1',
        contractAddress: testContract,
        transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        chainName: chainName,
        timestamp: Date.now(),
        price: 0.0016, // Floor price from the image
        priceUSD: 0.0016 * 3000, // Assuming ETH = $3000
        totalPrice: 0.0016,
        totalPriceUSD: 0.0016 * 3000,
        quantity: 1,
        imageUrl: 'https://example.com/nft-image.jpg',
        nftName: 'THE DROPZONE #1',
        nativeSymbol: 'ETH',
        floorPrice: stats.floor_price,
        buyPrice: 0.0016,
        buyPriceUSD: 0.0016 * 3000,
        isSweep: false,
        buyTimestamp: Date.now() - (24 * 60 * 60 * 1000) // 24 hours ago
      };
      
      console.log('\n📨 Creating Discord notification preview...');
      
      // Create the embed manually to show what it would look like
      const embed = await discordNotifier.createEmbed(mockTransactionData, nftTracker);
      
      console.log('\n📋 Notification Preview:');
      console.log('=' * 50);
      console.log(`Title: ${embed.data.title}`);
      console.log(`Description: ${embed.data.description}`);
      console.log(`Color: ${embed.data.color}`);
      console.log('\nFields:');
      
      embed.data.fields.forEach((field, index) => {
        console.log(`${index + 1}. ${field.name}: ${field.value}`);
      });
      
      console.log('\n' + '=' * 50);
      
      // Show the stats that would be included
      console.log('\n📊 Collection Stats Used:');
      console.log(`🎯 Floor Price: ${stats.floor_price || 'N/A'} ETH`);
      console.log(`📈 24h Volume: ${stats.one_day_volume || 'N/A'} ETH`);
      console.log(`📈 7d Volume: ${stats.seven_day_volume || 'N/A'} ETH`);
      console.log(`📈 30d Volume: ${stats.thirty_day_volume || 'N/A'} ETH`);
      console.log(`📊 24h Volume Change: ${stats.one_day_volume_change !== undefined ? (stats.one_day_volume_change * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`📊 7d Volume Change: ${stats.seven_day_volume_change !== undefined ? (stats.seven_day_volume_change * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`📊 30d Volume Change: ${stats.thirty_day_volume_change !== undefined ? (stats.thirty_day_volume_change * 100).toFixed(1) + '%' : 'N/A'}`);
      
      // Send the actual notification if Discord is configured
      if (config.discord.botToken && config.discord.channelId) {
        console.log('\n📨 Sending actual Discord notification...');
        await discordNotifier.sendNotification(mockTransactionData, nftTracker);
        console.log('✅ Notification sent!');
      }
      
    } else {
      console.log('❌ Could not retrieve collection stats');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Disconnect Discord
    if (discordNotifier.client) {
      await discordNotifier.disconnect();
    }
  }
  
  console.log('\n✅ Enhanced Volume Notifications test completed!');
}

// Run the test
testEnhancedVolumeNotifications().catch(console.error); 