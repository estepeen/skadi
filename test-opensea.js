const NFTTracker = require('./services/nftTracker');

async function testOpenSeaAPI() {
  console.log('🧪 Testing OpenSea API integration...\n');
  
  const nftTracker = new NFTTracker();
  await nftTracker.initialize([]);
  
  // Test OCAS NFT #8430 that should be ~0.05 ETH
  const testContract = '0x078be86f3104a32313a47815792230a3808642cc';
  const testTokenId = '8430';
  
  console.log(`🔍 Testing OCAS NFT #${testTokenId}`);
  console.log(`📊 Expected price: ~0.05 ETH\n`);
  
  try {
    const openseaPrice = await nftTracker.getOpenSeaNFTPrice(testContract, testTokenId, 'Ethereum');
    console.log(`💰 OpenSea API price: ${openseaPrice} ETH`);
    
    if (openseaPrice > 0) {
      console.log(`\n✅ SUCCESS: Found price ${openseaPrice} ETH from OpenSea API!`);
    } else {
      console.log(`\n❌ FAILED: No price found from OpenSea API`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testOpenSeaAPI().catch(console.error); 