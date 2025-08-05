const NFTTracker = require('./services/nftTracker');

async function testPnLFix() {
  console.log('🧪 Testing PnL calculation with fixed price detection...');
  console.log('='.repeat(50));
  
  const nftTracker = new NFTTracker();
  
  // Initialize with test wallet
  await nftTracker.initialize([{
    address: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    name: 'STPN'
  }]);
  
  // Simulate a purchase event
  console.log('\n📥 Simulating PURCHASE event...');
  const purchaseEvent = {
    event_type: 'sale',
    event_timestamp: 1754332717,
    transaction: '0x1234567890abcdef',
    chain: 'base',
    payment: {
      quantity: '1899000000000000', // 0.001899 ETH
      token_address: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      symbol: 'ETH'
    },
    seller: '0x2c0f1b8be2aaa363fc1095de9d854a9e9bfd5006',
    buyer: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    quantity: 1,
    nft: {
      identifier: '205',
      collection: 'basepaint',
      contract: '0xba5e05cb26b78eda3a2f8e3b3814726305dcac83',
      name: 'BasePaint Day #205'
    }
  };
  
  await nftTracker.processOpenSeaEvent(purchaseEvent, {
    address: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    name: 'STPN'
  });
  
  // Check if purchase was stored
  const purchaseKey = '0xba5e05cb26b78eda3a2f8e3b3814726305dcac83_205';
  const purchaseData = nftTracker.nftPurchases.get(purchaseKey);
  
  if (purchaseData) {
    console.log('✅ Purchase data stored correctly:');
    console.log(`   Price: ${purchaseData.price} ETH`);
    console.log(`   Price USD: $${purchaseData.priceUSD}`);
    console.log(`   Timestamp: ${new Date(purchaseData.timestamp).toLocaleString()}`);
  } else {
    console.log('❌ Purchase data not stored!');
    return;
  }
  
  // Simulate a sale event (same NFT, higher price)
  console.log('\n📤 Simulating SALE event...');
  const saleEvent = {
    event_type: 'sale',
    event_timestamp: 1754332717 + 3600, // 1 hour later
    transaction: '0xabcdef1234567890',
    chain: 'base',
    payment: {
      quantity: '2500000000000000', // 0.0025 ETH (higher price)
      token_address: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      symbol: 'ETH'
    },
    seller: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    buyer: '0x2c0f1b8be2aaa363fc1095de9d854a9e9bfd5006',
    quantity: 1,
    nft: {
      identifier: '205',
      collection: 'basepaint',
      contract: '0xba5e05cb26b78eda3a2f8e3b3814726305dcac83',
      name: 'BasePaint Day #205'
    }
  };
  
  await nftTracker.processOpenSeaEvent(saleEvent, {
    address: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    name: 'STPN'
  });
  
  // Check if purchase was removed after sale
  const purchaseDataAfterSale = nftTracker.nftPurchases.get(purchaseKey);
  if (!purchaseDataAfterSale) {
    console.log('✅ Purchase data correctly removed after sale');
  } else {
    console.log('❌ Purchase data still exists after sale!');
  }
  
  // Test with Discord notification
  console.log('\n📨 Testing Discord notification with PnL...');
  const transactionData = {
    type: 'sale',
    walletName: 'STPN',
    walletAddress: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    fromAddress: '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d',
    toAddress: '0x2c0f1b8be2aaa363fc1095de9d854a9e9bfd5006',
    tokenName: 'basepaint',
    tokenId: '205',
    contractAddress: '0xba5e05cb26b78eda3a2f8e3b3814726305dcac83',
    transactionHash: '0xabcdef1234567890',
    chainName: 'Base',
    timestamp: new Date((1754332717 + 3600) * 1000),
    price: 0.0025, // Sale price
    priceUSD: 0.0025 * 3000, // Assuming ETH = $3000
    totalPrice: 0.0025,
    totalPriceUSD: 0.0025 * 3000,
    quantity: 1,
    imageUrl: 'https://example.com/nft.jpg',
    nftName: 'BasePaint Day #205',
    nativeSymbol: 'ETH',
    floorPrice: 0.0018,
    buyPrice: 0.001899, // Purchase price
    buyPriceUSD: 0.001899 * 3000,
    buyTimestamp: new Date(1754332717 * 1000)
  };
  
  // Calculate expected PnL
  const expectedPnl = 0.0025 - 0.001899;
  const expectedPnlPercent = ((expectedPnl / 0.001899) * 100).toFixed(2);
  
  console.log(`Expected PnL: ${expectedPnl} ETH (${expectedPnlPercent}%)`);
  console.log(`Expected PnL USD: $${(expectedPnl * 3000).toFixed(2)}`);
  
  // Send Discord notification (this will show the PnL calculation)
  await nftTracker.sendDiscordNotification(transactionData, nftTracker);
  
  console.log('\n✅ PnL test completed!');
}

// Run the test
testPnLFix().catch(console.error); 