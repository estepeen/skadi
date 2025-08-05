require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');

async function testPnLDisplay() {
  console.log('🧪 Testing PnL Display Format...');
  console.log('='.repeat(50));
  
  try {
    const discordNotifier = new DiscordNotifier();
    
    // Test case that matches your issue
    console.log('\n📊 Test: Small loss with potential NaN (your case)');
    const testData = {
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
      priceUSD: 0.8, // Sell price USD (this could cause NaN if buyPriceUSD is missing)
      quantity: 1,
      imageUrl: null,
      nftName: 'Test NFT #123',
      floorPrice: 0.08,
      buyPrice: 0.0006, // Buy price
      buyPriceUSD: 1.0, // Buy price USD
      buyTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    };
    
    const embed = await discordNotifier.createEmbed(testData);
    
    // Find PnL field in embed
    const pnlField = embed.data.fields.find(field => field.name.includes('PnL'));
    
    if (pnlField) {
      console.log('\n📋 PnL Field Content:');
      console.log('Name:', pnlField.name);
      console.log('Value:');
      console.log(pnlField.value);
      
      console.log('\n✅ Expected format:');
      console.log('😢 PnL');
      console.log('-<0.001 ETH');
      console.log('-$1');
      console.log('-9.1%');
      
      console.log('\n📊 Calculation details:');
      const pnl = testData.price - testData.buyPrice;
      const pnlUSD = testData.priceUSD - testData.buyPriceUSD;
      const percentage = (pnl / testData.buyPrice) * 100;
      
      console.log(`   PnL ETH: ${testData.price} - ${testData.buyPrice} = ${pnl}`);
      console.log(`   PnL USD: ${testData.priceUSD} - ${testData.buyPriceUSD} = ${pnlUSD}`);
      console.log(`   Percentage: (${pnl} / ${testData.buyPrice}) * 100 = ${percentage}%`);
      
    } else {
      console.log('❌ PnL field not found in embed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testPnLDisplay(); 