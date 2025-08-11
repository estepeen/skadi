const NFTTracker = require('./services/nftTracker');

async function testCreatorFees() {
  const nftTracker = new NFTTracker();
  
  try {
    // Test collection slug - replace with the one you want to test
    const testSlug = process.argv[2];
    
    if (!testSlug) {
      console.log('❌ Please provide a collection slug as argument');
      console.log('Usage: node test-royalties.js <collection-slug>');
      console.log('Example: node test-royalties.js tiny-buds40x40');
      return;
    }
    
    console.log(`🔍 Testing creator fees for collection: ${testSlug}`);
    console.log('=' .repeat(50));
    
    // Test on Base chain (since that's what we're using)
    const chain = 'Base';
    
    console.log(`📍 Chain: ${chain}`);
    console.log(`🔗 Slug: ${testSlug}`);
    console.log('');
    
    // Fetch collection info
    console.log('📊 Fetching collection info...');
    const collectionInfo = await nftTracker.getCollectionInfoBySlug(testSlug, chain);
    
    if (collectionInfo) {
      console.log('✅ Collection info found:');
      console.log(`   Name: ${collectionInfo.name}`);
      console.log(`   Description: ${collectionInfo.description || 'N/A'}`);
      console.log(`   External URL: ${collectionInfo.external_url || 'N/A'}`);
      console.log(`   Twitter: ${collectionInfo.twitter_username || 'N/A'}`);
      console.log(`   Discord: ${collectionInfo.discord_url || 'N/A'}`);
      console.log(`   Website: ${collectionInfo.homepage_url || 'N/A'}`);
    } else {
      console.log('❌ No collection info found');
    }
    
    console.log('');
    
    // Fetch collection stats
    console.log('📈 Fetching collection stats...');
    const stats = await nftTracker.getCollectionStats(testSlug, chain);
    
    if (stats) {
      console.log('✅ Collection stats found:');
      console.log(`   Floor Price: ${stats.floor_price || 'N/A'} ETH`);
      console.log(`   Total Volume: ${stats.total_volume || 'N/A'} ETH`);
      console.log(`   Total Supply: ${stats.total_supply || 'N/A'}`);
      console.log(`   Owners: ${stats.num_owners || 'N/A'}`);
    } else {
      console.log('❌ No collection stats found');
    }
    
    console.log('');
    
    // Fetch creator fees info
    console.log('💰 Fetching creator fees info...');
    const creatorFees = await nftTracker.getCollectionCreatorFees(testSlug, chain);
    
    if (creatorFees) {
      console.log('✅ Creator fees info found:');
      console.log(`   Percentage: ${creatorFees.percentage !== null ? creatorFees.percentage + '%' : 'null'}`);
      console.log(`   Is Enforced: ${creatorFees.is_enforced}`);
      console.log(`   Is Optional: ${creatorFees.is_optional}`);
      
      // Debug: show the raw creator fees data structure
      console.log('');
      console.log('🔍 Raw creator fees data structure:');
      console.log(JSON.stringify(creatorFees, null, 2));
    } else {
      console.log('❌ No creator fees info found');
    }
    
    console.log('');
    
    // Try to fetch via OpenSea API V2 directly
    console.log('🔍 Trying OpenSea API V2 directly...');
    try {
      const openseaResponse = await nftTracker.fetchOpenSeaCollectionInfo(testSlug, chain);
      if (openseaResponse) {
        console.log('✅ OpenSea API V2 response:');
        console.log(JSON.stringify(openseaResponse, null, 2));
      } else {
        console.log('❌ No OpenSea API V2 response');
      }
    } catch (error) {
      console.log('❌ OpenSea API V2 error:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await nftTracker.disconnect();
    process.exit(0);
  }
}

// Run the test
testCreatorFees();
