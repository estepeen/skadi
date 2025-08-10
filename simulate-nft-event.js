#!/usr/bin/env node

const NFTTracker = require('./services/nftTracker');
const config = require('./config');

async function simulateNFTEvent() {
  console.log('🎭 NFT Event Simulation Script');
  console.log('='.repeat(50));
  
  try {
    // Initialize NFT tracker
    console.log('🔧 Initializing NFT Tracker...');
    const nftTracker = new NFTTracker();
    
    // Create test wallets
    const testWallets = [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Wallet 1'
      },
      {
        address: '0x0987654321098765432109876543210987654321',
        name: 'Test Wallet 2'
      }
    ];
    
    console.log('📝 Setting up test wallets...');
    await nftTracker.initialize(testWallets);
    
    // Simulate different types of events
    const testEvents = [
      {
        type: 'purchase',
        walletName: 'Test Wallet 1',
        walletAddress: '0x1234567890123456789012345678901234567890',
        tokenName: 'Bored Ape Yacht Club',
        tokenId: '1234',
        contractAddress: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        chainName: 'Ethereum',
        timestamp: Date.now(),
        price: 25.5,
        priceUSD: 51000,
        quantity: 1,
        isBulk: false
      },
      {
        type: 'sale',
        walletName: 'Test Wallet 2',
        walletAddress: '0x0987654321098765432109876543210987654321',
        tokenName: 'Doodles',
        tokenId: '5678',
        contractAddress: '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e',
        transactionHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        chainName: 'Ethereum',
        timestamp: Date.now(),
        price: 12.75,
        priceUSD: 25500,
        quantity: 1,
        isBulk: false
      },
      {
        type: 'purchase',
        walletName: 'Test Wallet 1',
        walletAddress: '0x1234567890123456789012345678901234567890',
        tokenName: 'Azuki',
        tokenId: '9999',
        contractAddress: '0xed5af3886537af0d38886662ffac0779411b9c1b5',
        transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        chainName: 'Ethereum',
        timestamp: Date.now(),
        price: 8.25,
        priceUSD: 16500,
        quantity: 3,
        isBulk: true
      }
    ];
    
    console.log('📤 Testing Discord notifications...');
    
    for (let i = 0; i < testEvents.length; i++) {
      const event = testEvents[i];
      console.log(`\n🎯 Testing ${event.type} event (${i + 1}/${testEvents.length})...`);
      console.log(`   Wallet: ${event.walletName}`);
      console.log(`   NFT: ${event.tokenName} #${event.tokenId}`);
      console.log(`   Price: ${event.price} ETH ($${event.priceUSD})`);
      
      try {
        await nftTracker.sendDiscordNotification(event, nftTracker);
        console.log('   ✅ Notification sent successfully!');
      } catch (error) {
        console.log(`   ❌ Notification failed: ${error.message}`);
      }
      
      // Wait between notifications
      if (i < testEvents.length - 1) {
        console.log('   ⏳ Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Cleanup
    if (nftTracker.discordNotifier) {
      await nftTracker.discordNotifier.disconnect();
      console.log('\n🔌 Discord connection closed');
    }
    
    console.log('\n🎭 Simulation complete!');
    console.log('💡 Check your Discord channel for the test messages.');
    
  } catch (error) {
    console.error('❌ Simulation failed:', error.message);
    console.log('   Full error:', error);
    
    if (error.message.includes('Discord')) {
      console.log('\n💡 Discord issues detected:');
      console.log('   - Run: node debug-discord.js');
      console.log('   - Check bot permissions');
      console.log('   - Verify bot token');
    }
  }
  
  console.log('\n' + '='.repeat(50));
}

// Run simulation
simulateNFTEvent().catch(console.error);
