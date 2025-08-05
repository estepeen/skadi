const DiscordNotifier = require('./services/discordNotifier');
const NFTTracker = require('./services/nftTracker');
const config = require('./config');

async function testDiscordNotification() {
  console.log('🧪 Testing Discord notification with volume and price change data...\n');
  
  const nftTracker = new NFTTracker();
  const discordNotifier = new DiscordNotifier();
  
  try {
    // Connect to Discord
    await discordNotifier.connect();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test data for a purchase
    const testPurchaseData = {
      type: 'purchase',
      walletName: 'Test Wallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0x0987654321098765432109876543210987654321',
      tokenName: 'cool-cats-nft', // Use slug for collection info
      tokenId: '0x1',
      contractAddress: '0x1a92f7381b9f03921564a437210bb9396471050c',
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.5,
      priceUSD: 1500,
      quantity: 1,
      imageUrl: 'https://i.seadn.io/gae/eE1I3EDt-_vLlXpmW2eRml5qqtJt-m5mFNhwTlnl-tC6f8KJPxK9q2u5ZYZ3emkq0P9n0wz6T1zMiF9Up4_JAqFw?w=500&auto=format',
      nftName: 'Cool Cat #1234',
      nativeSymbol: 'ETH',
      floorPrice: 0.43402999
    };
    
    console.log('📨 Sending test purchase notification...');
    await discordNotifier.sendNotification(testPurchaseData, nftTracker);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test data for a sale with PnL
    const testSaleData = {
      type: 'sale',
      walletName: 'Test Wallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromAddress: '0x1234567890123456789012345678901234567890',
      toAddress: '0x0987654321098765432109876543210987654321',
      tokenName: 'boredapeyachtclub', // Use slug for collection info
      tokenId: '0x2',
      contractAddress: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      transactionHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 12.5,
      priceUSD: 37500,
      quantity: 1,
      imageUrl: 'https://i.seadn.io/gae/Ju9CkWtV-1Okvf45wo8UctR-M9He2PjILP0oOvxE89AyiPPGtrR3gysu1Zgy0hjd2xKIgjJJtWIc0ybj4Vd7wv8t3pxDGHoJBzDB?w=500&auto=format',
      nftName: 'Bored Ape #5678',
      nativeSymbol: 'ETH',
      floorPrice: 11.759951,
      buyPrice: 10.0,
      buyPriceUSD: 30000,
      buyTimestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    };
    
    console.log('📨 Sending test sale notification...');
    await discordNotifier.sendNotification(testSaleData, nftTracker);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test data for a Base chain collection
    const testBaseData = {
      type: 'purchase',
      walletName: 'Base Wallet',
      walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      toAddress: '0x1234567890abcdef1234567890abcdef12345678',
      tokenName: 'dropzone-mcade', // Use slug for collection info
      tokenId: '0x3',
      contractAddress: '0x23a5e200a37bad403d1b3181f5cec072e381cae6',
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      chainName: 'Base',
      timestamp: new Date(),
      price: 0.002,
      priceUSD: 6,
      quantity: 1,
      imageUrl: 'https://i.seadn.io/gae/example-image-url',
      nftName: 'THE DROPZONE #9999',
      nativeSymbol: 'ETH',
      floorPrice: 0.00159999
    };
    
    console.log('📨 Sending test Base chain notification...');
    await discordNotifier.sendNotification(testBaseData, nftTracker);
    
    console.log('\n✅ All test notifications sent! Check your Discord channel.');
    
  } catch (error) {
    console.error('❌ Error testing Discord notifications:', error.message);
  } finally {
    // Disconnect after a delay to allow notifications to be sent
    setTimeout(async () => {
      await discordNotifier.disconnect();
      console.log('🔌 Discord bot disconnected');
    }, 5000);
  }
}

// Run the test
testDiscordNotification().catch(console.error); 