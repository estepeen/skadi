const NFTTracker = require('./services/nftTracker');

async function testPriceFormatting() {
  console.log('🧪 Testing Price Formatting and Chain in Description...\n');
  
  const nftTracker = new NFTTracker();
  
  // Test wallet
  const testWallets = [
    {
      address: '0x66666F5890F6D66666',
      name: 'FLC'
    }
  ];
  
  await nftTracker.initialize(testWallets);
  
  console.log('🔍 Testing price formatting and chain in description...\n');
  
  try {
    // Test 1: Purchase with different price formats
    console.log('📋 Test 1: Purchase with price formatting');
    console.log('Expected:');
    console.log('- Description: "FLC just bought Potatoz #8768 on Ethereum chain."');
    console.log('- Buy Price: 0.2 ETH (instead of 0.2000)');
    console.log('- Floor Price: 0.184 ETH (instead of 0.18400)\n');
    
    await nftTracker.sendDiscordNotification({
      type: 'purchase',
      walletName: 'FLC',
      walletAddress: '0x66666F5890F6D66666',
      fromAddress: '0x1234567890123456789012345678901234567890',
      tokenName: 'Potatoz',
      tokenId: '8768',
      contractAddress: '0x39ee2c7b3cb44442',
      transactionHash: '0x4bcda07a494d4b7c7d3d87c68891eefcad58f81e014c73b3103ab94857b2a5b1',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.2000, // Should display as 0.2
      priceUSD: 708.00,
      quantity: 1,
      imageUrl: 'https://example.com/potatoz.jpg',
      nftName: 'Potatoz #8768',
      floorPrice: 0.18400 // Should display as 0.184
    });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Sale with different price formats
    console.log('📋 Test 2: Sale with price formatting');
    console.log('Expected:');
    console.log('- Description: "FLC just sold Potatoz #8768 on Ethereum chain."');
    console.log('- Buy Price: 0.0296 ETH (instead of 0.029646)');
    console.log('- Sell Price: 0.2 ETH (instead of 0.2000)');
    console.log('- Floor Price: 0.184 ETH (instead of 0.18400)\n');
    
    await nftTracker.sendDiscordNotification({
      type: 'sale',
      walletName: 'FLC',
      walletAddress: '0x66666F5890F6D66666',
      toAddress: '0x1234567890123456789012345678901234567890',
      tokenName: 'Potatoz',
      tokenId: '8768',
      contractAddress: '0x39ee2c7b3cb44442',
      transactionHash: '0x4bcda07a494d4b7c7d3d87c68891eefcad58f81e014c73b3103ab94857b2a5b2',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.2000, // Should display as 0.2
      priceUSD: 708.00,
      quantity: 1,
      imageUrl: 'https://example.com/potatoz.jpg',
      nftName: 'Potatoz #8768',
      floorPrice: 0.18400, // Should display as 0.184
      buyPrice: 0.029646, // Should display as 0.0296
      buyPriceUSD: 104.99,
      buyTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    });
    
    // Test 3: Test price formatting function directly
    console.log('📋 Test 3: Price formatting function test');
    const discordNotifier = new (require('./services/discordNotifier'))();
    
    const testPrices = [
      0.2000,    // Should be 0.2
      0.18400,   // Should be 0.184
      0.029646,  // Should be 0.0296
      1.5000,    // Should be 1.5
      2.0000,    // Should be 2
      0.1000,    // Should be 0.1
      0.0010,    // Should be 0.001
      0.0001     // Should be 0.0001
    ];
    
    console.log('Price formatting examples:');
    testPrices.forEach(price => {
      const formatted = discordNotifier.formatPrice(price);
      console.log(`  ${price} → ${formatted}`);
    });
    
    console.log('\n✅ Tests completed! Check Discord for:');
    console.log('   - Chain name in description');
    console.log('   - Clean price formatting (no trailing zeros)');
    console.log('   - Proper decimal places');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPriceFormatting().catch(console.error); 