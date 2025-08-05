const CSVReader = require('./utils/csvReader');
const config = require('./config');
const DiscordNotifier = require('./services/discordNotifier');

async function testSetup() {
  try {
    console.log('🧪 Testing NFT Tracker Setup...');
    console.log('='.repeat(40));
    
    // Test CSV reading
    console.log('📁 Testing CSV reader...');
    const csvReader = new CSVReader(config.csvFile);
    const wallets = await csvReader.readWallets();
    
    console.log(`✅ Loaded ${wallets.length} wallets from CSV`);
    wallets.forEach(wallet => {
      console.log(`   - ${wallet.name}: ${wallet.address}`);
    });
    
    // Test configuration
    console.log('\n⚙️  Testing configuration...');
    console.log(`   Discord Bot Token: ${config.discord.botToken ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Discord Channel ID: ${config.discord.channelId ? '✅ Set' : '❌ Missing'}`);
    console.log(`   OpenSea API Key: ${config.opensea.apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Etherscan API Key: ${config.etherscan.apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Scan Interval: ${config.scanInterval}ms`);
    
    console.log('\n✅ Setup test completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Configure your .env file with Discord and API keys');
    console.log('2. Run: npm start');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function testDiscordNotifications() {
  console.log('🧪 Testing Discord Notifications...');
  
  const discordNotifier = new DiscordNotifier();
  const nftTracker = new (require('./services/nftTracker'))();
  
  try {
    // Connect to Discord
    await discordNotifier.connect();
    console.log('✅ Connected to Discord');
    
    // Wait a bit for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 1: NFT Purchase
    console.log('\n📤 Sending test PURCHASE notification...');
    await discordNotifier.sendNotification({
      type: 'purchase',
      walletName: 'STPN',
      walletAddress: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
      fromAddress: '0xa572a13ee1ce16a386ac995db365d949cba6f9d1',
      tokenName: 'Azuki',
      tokenId: '0x0000000000000000000000000000000000000000000000000000000000000123',
      contractAddress: 'azuki', // Using slug instead of contract address
      transactionHash: '0xazuki1234567890abcdef1234567890abcdef1234567890abcdef123456789',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 8.50, // Bought for 8.50 ETH
      priceUSD: 2975.00,
      quantity: 1,
      imageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=400&fit=crop',
      nftName: 'Azuki #291',
      nativeSymbol: 'ETH',
      floorPrice: 8.75 // This should be fetched from OpenSea API
    }, nftTracker);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: NFT Sale with profit
    console.log('\n📤 Sending test SALE notification...');
    await discordNotifier.sendNotification({
      type: 'sale',
      walletName: 'STPN',
      walletAddress: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
      toAddress: '0xa572a13ee1ce16a386ac995db365d949cba6f9d1',
      tokenName: 'Bored Ape Yacht Club',
      tokenId: '0x0000000000000000000000000000000000000000000000000000000000000911', // 2321 in hex
      contractAddress: 'boredapeyachtclub', // Using slug instead of contract address
      transactionHash: '0xbayc2321profit1234567890abcdef1234567890abcdef1234567890abcdef123456789',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 14.50, // Sold for 14.50 ETH
      priceUSD: 5075.00, // Assuming ~350 USD per ETH
      quantity: 1,
      imageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=400&fit=crop',
      nftName: 'Bored Ape Yacht Club #2321',
      nativeSymbol: 'ETH',
      floorPrice: 15.20, // Current floor price
      buyPrice: 7.00, // Bought for 7.00 ETH
      buyPriceUSD: 2450.00, // Assuming ~350 USD per ETH when bought
      buyTimestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
    }, nftTracker);

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 3: NFT Mint
    console.log('\n📤 Sending test MINT notification...');
    await discordNotifier.sendNotification({
      type: 'mint',
      walletName: 'STPN',
      walletAddress: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
      tokenName: 'Doodles',
      tokenId: '0x0000000000000000000000000000000000000000000000000000000000000456',
      contractAddress: 'doodles-official', // Using slug instead of contract address
      transactionHash: '0xef00cfe61325a603b29d3b9a51199b3178ff451a60aba0b5478ca2165fa77c8e',
      chainName: 'Ethereum',
      timestamp: new Date(),
      price: 0.0015,
      priceUSD: 0.75,
      quantity: 1,
      imageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=400&fit=crop',
      nftName: 'Doodles #1110',
      nativeSymbol: 'ETH'
    }, nftTracker);

    console.log('\n✅ All test notifications sent!');
    
  } catch (error) {
    console.error('❌ Error testing notifications:', error);
  } finally {
    // Disconnect
    await discordNotifier.disconnect();
    console.log('🔌 Disconnected from Discord');
  }
}

// Run the test
testDiscordNotifications();

// Also run setup test
testSetup(); 