const NFTTracker = require('./services/nftTracker');

async function testMagicEdenAPI() {
  console.log('🧪 Testing Floor Price API...');
  console.log('='.repeat(40));
  
  const nftTracker = new NFTTracker();
  
  // Test Azuki contract address
  const azukiContract = '0xed5af388653567af7a388d4b5b0c5c5c5c5c5c5c';
  
  try {
    console.log('📊 Testing floor price for Azuki...');
    const floorPrice = await nftTracker.getFloorPrice(azukiContract, 'Ethereum');
    console.log(`✅ Azuki floor price: ${floorPrice} ETH`);
    
    // Test with BAYC contract
    console.log('\n📊 Testing floor price for BAYC...');
    const baycContract = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
    const baycFloorPrice = await nftTracker.getFloorPrice(baycContract, 'Ethereum');
    console.log(`✅ BAYC floor price: ${baycFloorPrice} ETH`);
    
    // Test Doodles contract
    console.log('\n📊 Testing floor price for Doodles...');
    const doodlesContract = '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e';
    const doodlesFloorPrice = await nftTracker.getFloorPrice(doodlesContract, 'Ethereum');
    console.log(`✅ Doodles floor price: ${doodlesFloorPrice} ETH`);
    
    // Test Base chain
    console.log('\n📊 Testing Base chain floor price...');
    const baseContract = '0x41dc69132cce31fcbf6755c84538ca268520246f';
    const baseFloorPrice = await nftTracker.getFloorPrice(baseContract, 'Base');
    console.log(`✅ Base TERMINAL floor price: ${baseFloorPrice} ETH`);
    
    // Test unknown contract
    console.log('\n📊 Testing unknown contract...');
    const unknownContract = '0x1234567890123456789012345678901234567890';
    const unknownFloorPrice = await nftTracker.getFloorPrice(unknownContract, 'Ethereum');
    console.log(`✅ Unknown contract floor price: ${unknownFloorPrice} ETH`);
    
  } catch (error) {
    console.error('❌ Error testing floor price API:', error.message);
  }
}

testMagicEdenAPI(); 