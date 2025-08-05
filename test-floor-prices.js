const NFTTracker = require('./services/nftTracker');

async function testCurrentFloorPrices() {
  console.log('🧪 Testing Current Floor Price APIs...');
  console.log('='.repeat(50));
  
  const nftTracker = new NFTTracker();
  
  // Test contracts
  const testContracts = [
    {
      address: '0xed5af388653567af7a388d4b5b0c5c5c5c5c5c5c',
      name: 'Azuki',
      chain: 'Ethereum'
    },
    {
      address: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      name: 'BAYC',
      chain: 'Ethereum'
    },
    {
      address: '0x60e4d786628fea6478f785a6d7e704777c86a7c6',
      name: 'Doodles',
      chain: 'Ethereum'
    },
    {
      address: '0x41dc69132cce31fcbf6755c84538ca268520246f',
      name: 'TERMINAL',
      chain: 'Base'
    }
  ];
  
  for (const contract of testContracts) {
    console.log(`\n📊 Testing ${contract.name} (${contract.chain})...`);
    console.log(`Contract: ${contract.address}`);
    
    try {
      const startTime = Date.now();
      const floorPrice = await nftTracker.getFloorPrice(contract.address, contract.chain);
      const endTime = Date.now();
      
      console.log(`✅ Floor price: ${floorPrice} ETH`);
      console.log(`⏱️  Response time: ${endTime - startTime}ms`);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 Floor price test completed!');
}

testCurrentFloorPrices().catch(console.error); 