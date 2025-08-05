const NFTTracker = require('./services/nftTracker');
const DiscordNotifier = require('./services/discordNotifier');
const config = require('./config');

async function testCollectionDisplay() {
  console.log('🧪 Testing Collection Display and Unwrapped Units...\n');
  
  const nftTracker = new NFTTracker();
  const discordNotifier = new DiscordNotifier();
  
  try {
    // Initialize Discord notifier
    if (config.discord.botToken && config.discord.channelId) {
      await discordNotifier.connect();
      console.log('✅ Discord notifier connected');
    } else {
      console.log('⚠️ Discord not configured, will only show notification preview');
    }
    
    // Test 1: Purchase with WETH (should display as ETH)
    console.log('\n📥 Test 1: Purchase with WETH (should display as ETH)...');
    
    const purchaseData = {
      type: 'purchase',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      toAddress: '0x1234567890123456789012345678901234567890',
      tokenName: 'test-collection', // Slug for collection lookup
      tokenId: '0x1',
      contractAddress: '0x1234567890123456789012345678901234567890',
      transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      chainName: 'Ethereum',
      timestamp: Date.now(),
      price: 0.0323,
      priceUSD: 0.0323 * 3000,
      totalPrice: 0.0323,
      totalPriceUSD: 0.0323 * 3000,
      quantity: 1,
      imageUrl: 'https://example.com/nft1.jpg',
      nftName: 'Unknown', // Should use collection name instead
      nativeSymbol: 'WETH', // Should display as ETH
      floorPrice: 0.03232,
      buyPrice: 0.0323,
      buyPriceUSD: 0.0323 * 3000,
      isSweep: false,
      buyTimestamp: Date.now() - (24 * 60 * 60 * 1000)
    };
    
    // Create the embed manually to show what it would look like
    const purchaseEmbed = await discordNotifier.createEmbed(purchaseData, nftTracker);
    
    console.log('\n📋 Purchase Notification Preview:');
    console.log('=' * 50);
    console.log(`Title: ${purchaseEmbed.data.title}`);
    console.log(`Description: ${purchaseEmbed.data.description}`);
    console.log(`Color: ${purchaseEmbed.data.color}`);
    console.log('\nFields:');
    
    purchaseEmbed.data.fields.forEach((field, index) => {
      console.log(`${index + 1}. ${field.name}: ${field.value}`);
    });
    
    console.log('\n' + '=' * 50);
    
    // Test 2: Sale with WETH and PnL (should display as ETH)
    console.log('\n📤 Test 2: Sale with WETH and PnL (should display as ETH)...');
    
    const saleData = {
      type: 'sale',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenName: 'test-collection',
      tokenId: '0x1',
      contractAddress: '0x1234567890123456789012345678901234567890',
      transactionHash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chainName: 'Ethereum',
      timestamp: Date.now(),
      price: 0.0277,
      priceUSD: 0.0277 * 3000,
      totalPrice: 0.0277,
      totalPriceUSD: 0.0277 * 3000,
      quantity: 1,
      imageUrl: 'https://example.com/nft1.jpg',
      nftName: 'Unknown',
      nativeSymbol: 'WETH',
      floorPrice: 0.03210,
      buyPrice: 0.0323, // Purchase price
      buyPriceUSD: 0.0323 * 3000,
      buyTimestamp: Date.now() - (6 * 60 * 60 * 1000), // 6 hours ago
      isSweep: false
    };
    
    // Create the embed manually to show what it would look like
    const saleEmbed = await discordNotifier.createEmbed(saleData, nftTracker);
    
    console.log('\n📋 Sale Notification Preview:');
    console.log('=' * 50);
    console.log(`Title: ${saleEmbed.data.title}`);
    console.log(`Description: ${saleEmbed.data.description}`);
    console.log(`Color: ${saleEmbed.data.color}`);
    console.log('\nFields:');
    
    saleEmbed.data.fields.forEach((field, index) => {
      console.log(`${index + 1}. ${field.name}: ${field.value}`);
    });
    
    console.log('\n' + '=' * 50);
    
    // Test 3: Purchase with known collection name
    console.log('\n📥 Test 3: Purchase with known collection name...');
    
    const purchaseData2 = {
      type: 'purchase',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      toAddress: '0x1234567890123456789012345678901234567890',
      tokenName: 'boredapeyachtclub', // Known collection slug
      tokenId: '0x1234',
      contractAddress: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      chainName: 'Ethereum',
      timestamp: Date.now(),
      price: 25.5,
      priceUSD: 25.5 * 3000,
      totalPrice: 25.5,
      totalPriceUSD: 25.5 * 3000,
      quantity: 1,
      imageUrl: 'https://example.com/bayc.jpg',
      nftName: 'Unknown',
      nativeSymbol: 'ETH',
      floorPrice: 25.0,
      buyPrice: 25.5,
      buyPriceUSD: 25.5 * 3000,
      isSweep: false,
      buyTimestamp: Date.now() - (24 * 60 * 60 * 1000)
    };
    
    // Create the embed manually to show what it would look like
    const purchaseEmbed2 = await discordNotifier.createEmbed(purchaseData2, nftTracker);
    
    console.log('\n📋 BAYC Purchase Notification Preview:');
    console.log('=' * 50);
    console.log(`Title: ${purchaseEmbed2.data.title}`);
    console.log(`Description: ${purchaseEmbed2.data.description}`);
    console.log(`Color: ${purchaseEmbed2.data.color}`);
    console.log('\nFields:');
    
    purchaseEmbed2.data.fields.forEach((field, index) => {
      console.log(`${index + 1}. ${field.name}: ${field.value}`);
    });
    
    console.log('\n' + '=' * 50);
    
    // Send test notifications if Discord is configured
    if (config.discord.botToken && config.discord.channelId) {
      console.log('\n📨 Sending test notifications...');
      await discordNotifier.sendNotification(purchaseData, nftTracker);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await discordNotifier.sendNotification(saleData, nftTracker);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await discordNotifier.sendNotification(purchaseData2, nftTracker);
      console.log('✅ Test notifications sent!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Disconnect Discord
    if (discordNotifier.client) {
      await discordNotifier.disconnect();
    }
  }
  
  console.log('\n✅ Collection Display test completed!');
}

// Run the test
testCollectionDisplay().catch(console.error); 