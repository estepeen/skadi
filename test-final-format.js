const NFTTracker = require('./services/nftTracker');

async function testFinalFormat() {
  console.log('🧪 Testing Final Discord Notification Format...\n');
  
  const nftTracker = new NFTTracker();
  
  // Test wallet
  const testWallets = [
    {
      address: '0x66666F5890F6D66666',
      name: 'FLC'
    }
  ];
  
  await nftTracker.initialize(testWallets);
  
  console.log('🔍 Testing final notification format...\n');
  
  try {
    // Test 1: Purchase notification
    console.log('📋 Test 1: Purchase Notification');
    console.log('Expected changes:');
    console.log('- No "1x" or "(#8768)" in description');
    console.log('- Floor price info in description');
    console.log('- Links: OpenSea | Twitter | Discord | Website | Explorer\n');
    
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
      price: 0.029646,
      priceUSD: 104.99,
      quantity: 1,
      imageUrl: 'https://example.com/potatoz.jpg',
      nftName: 'Potatoz #8768',
      floorPrice: 0.18400
    });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Sale notification with PnL
    console.log('📋 Test 2: Sale Notification with PnL');
    console.log('Expected changes:');
    console.log('- No závorky u dolarů v PnL');
    console.log('- No "1x" or "(#8768)" in description');
    console.log('- Floor price info in description');
    console.log('- Links: OpenSea | Twitter | Discord | Website | Explorer\n');
    
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
      price: 0.200000,
      priceUSD: 708.00,
      quantity: 1,
      imageUrl: 'https://example.com/potatoz.jpg',
      nftName: 'Potatoz #8768',
      floorPrice: 0.18400,
      buyPrice: 0.029646,
      buyPriceUSD: 104.99,
      buyTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    });
    
    console.log('\n✅ Final tests completed! Check Discord for:');
    console.log('   - Row 1: Buy Price | Sell Price | PnL (no závorky u $)');
    console.log('   - Row 2: Hodl time | Floor price | Chain');
    console.log('   - Description: no "1x" or ID, with floor price info');
    console.log('   - Links: OpenSea | Twitter | Discord | Website | Explorer');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFinalFormat().catch(console.error); 