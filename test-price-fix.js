const NFTTracker = require('./services/nftTracker');

async function testPriceFix() {
  console.log('🧪 Testing new price detection logic...\n');
  
  const nftTracker = new NFTTracker();
  await nftTracker.initialize([]);
  
  // Test the OCAS transaction that should be 0.04 ETH
  const testTxHash = '0xdda60b4c998860b3a156a1834f7f9221a073dcd864692b032dcae2962d18dc51';
  
  console.log(`🔍 Testing OCAS transaction: ${testTxHash}`);
  console.log(`📊 Expected price: ~0.04 ETH\n`);
  
  try {
    const txData = await nftTracker.getTransactionData(testTxHash, 'Ethereum');
    console.log(`📊 Transaction data:`);
    console.log(`   Price: ${txData.price} ETH`);
    console.log(`   Price USD: $${txData.priceUSD.toFixed(2)}`);
    console.log(`   Gas Used: ${txData.gasUsed}`);
    console.log(`   Gas Price: ${txData.gasPrice}`);
    
    if (Math.abs(txData.price - 0.04) < 0.01) {
      console.log(`\n✅ SUCCESS: Price is close to expected 0.04 ETH!`);
    } else {
      console.log(`\n❌ FAILED: Price ${txData.price} ETH is not close to expected 0.04 ETH`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPriceFix().catch(console.error); 