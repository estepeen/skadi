require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');

async function testPnLFormatting() {
  console.log('🧪 Testing PnL Formatting Fix...');
  console.log('='.repeat(50));
  
  try {
    const discordNotifier = new DiscordNotifier();
    
    // Test 1: Small loss with potential NaN
    console.log('\n📊 Test 1: Small loss (<0.001 ETH, <$1)');
    const testData1 = {
      type: 'sale',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenName: 'Test NFT Collection',
      tokenId: '123',
      contractAddress: '0x9876543210987654321098765432109876543210',
      transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.0005, // Sell price
      priceUSD: 0.8, // Sell price USD
      quantity: 1,
      imageUrl: null,
      nftName: 'Test NFT #123',
      floorPrice: 0.08,
      buyPrice: 0.0006, // Buy price
      buyPriceUSD: 1.0, // Buy price USD
      buyTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    };
    
    const embed1 = await discordNotifier.createEmbed(testData1);
    console.log('✅ Test 1 embed created');
    
    // Test 2: Larger loss
    console.log('\n📊 Test 2: Larger loss');
    const testData2 = {
      type: 'sale',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenName: 'Test NFT Collection',
      tokenId: '124',
      contractAddress: '0x9876543210987654321098765432109876543210',
      transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.05, // Sell price
      priceUSD: 80, // Sell price USD
      quantity: 1,
      imageUrl: null,
      nftName: 'Test NFT #124',
      floorPrice: 0.08,
      buyPrice: 0.08, // Buy price
      buyPriceUSD: 120, // Buy price USD
      buyTimestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
    };
    
    const embed2 = await discordNotifier.createEmbed(testData2);
    console.log('✅ Test 2 embed created');
    
    // Test 3: Profit
    console.log('\n📊 Test 3: Profit');
    const testData3 = {
      type: 'sale',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenName: 'Test NFT Collection',
      tokenId: '125',
      contractAddress: '0x9876543210987654321098765432109876543210',
      transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.12, // Sell price
      priceUSD: 180, // Sell price USD
      quantity: 1,
      imageUrl: null,
      nftName: 'Test NFT #125',
      floorPrice: 0.08,
      buyPrice: 0.08, // Buy price
      buyPriceUSD: 120, // Buy price USD
      buyTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    };
    
    const embed3 = await discordNotifier.createEmbed(testData3);
    console.log('✅ Test 3 embed created');
    
    // Test 4: Edge case with potential NaN
    console.log('\n📊 Test 4: Edge case with potential NaN values');
    const testData4 = {
      type: 'sale',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenName: 'Test NFT Collection',
      tokenId: '126',
      contractAddress: '0x9876543210987654321098765432109876543210',
      transactionHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.001, // Sell price
      priceUSD: NaN, // This should cause NaN in PnL USD
      quantity: 1,
      imageUrl: null,
      nftName: 'Test NFT #126',
      floorPrice: 0.08,
      buyPrice: 0.002, // Buy price
      buyPriceUSD: 3, // Buy price USD
      buyTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    };
    
    const embed4 = await discordNotifier.createEmbed(testData4);
    console.log('✅ Test 4 embed created');
    
    console.log('\n🎯 PnL Formatting Tests Completed!');
    console.log('📋 Expected format for each test:');
    console.log('   Test 1: Small loss - should show <0.001 ETH, <$1, -9.1%');
    console.log('   Test 2: Larger loss - should show -0.03 ETH, -$40, -37.5%');
    console.log('   Test 3: Profit - should show +0.04 ETH, +$60, +50.0%');
    console.log('   Test 4: NaN case - should show -0.001 ETH, <$1, -50.0%');
    
    console.log('\n💡 To see actual Discord notifications, run:');
    console.log('   node test-discord.js');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testPnLFormatting(); 