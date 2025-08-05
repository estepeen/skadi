const NFTTracker = require('./services/nftTracker');

async function testBAYCMagicEden() {
  console.log('🧪 Testing BAYC with Magic Eden API v2...');
  console.log('='.repeat(50));
  
  const nftTracker = new NFTTracker();
  
  // BAYC contract address
  const baycContract = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
  
  try {
    console.log('📊 Getting BAYC floor price from Magic Eden API...');
    const floorPrice = await nftTracker.getFloorPrice(baycContract, 'Ethereum');
    console.log(`✅ BAYC floor price: ${floorPrice} ETH`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testBAYCMagicEden().catch(console.error); 