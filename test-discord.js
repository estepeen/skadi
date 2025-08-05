require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');

async function testDiscordConnection() {
  console.log('🧪 Testing Discord Connection...');
  console.log('='.repeat(50));
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`   DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`   DISCORD_CHANNEL_ID: ${process.env.DISCORD_CHANNEL_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   ETHERSCAN_API_KEY: ${process.env.ETHERSCAN_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   OPENSEA_API_KEY: ${process.env.OPENSEA_API_KEY ? '✅ Set' : '❌ Missing'}`);
  
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
    console.log('\n❌ Missing required Discord environment variables!');
    console.log('Please create a .env file with:');
    console.log('DISCORD_BOT_TOKEN=your_bot_token_here');
    console.log('DISCORD_CHANNEL_ID=your_channel_id_here');
    return;
  }
  
  try {
    // Create Discord notifier
    const discordNotifier = new DiscordNotifier();
    
    console.log('\n🔗 Connecting to Discord...');
    await discordNotifier.connect();
    
    console.log('✅ Discord connection successful!');
    
    // Test notification
    console.log('\n📤 Sending test notification...');
    const testData = {
      type: 'purchase',
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenName: 'Test NFT Collection',
      tokenId: '123',
      contractAddress: '0x9876543210987654321098765432109876543210',
      transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.1,
      priceUSD: 200,
      quantity: 1,
      imageUrl: null,
      nftName: 'Test NFT #123',
      floorPrice: 0.08
    };
    
    await discordNotifier.sendNotification(testData);
    console.log('✅ Test notification sent successfully!');
    
    // Disconnect
    await discordNotifier.disconnect();
    console.log('🔌 Discord disconnected');
    
  } catch (error) {
    console.error('❌ Discord test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run test
testDiscordConnection(); 