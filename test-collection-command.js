const CollectionCommand = require('./services/collectionCommand');

async function testCollectionCommand() {
  const collectionCommand = new CollectionCommand();
  
  try {
    console.log('🧪 Testing Collection Command...');
    console.log('='.repeat(50));
    
    // Test collection slug - replace with the one you want to test
    const testSlug = process.argv[2];
    
    if (!testSlug) {
      console.log('❌ Please provide a collection slug as argument');
      console.log('Usage: node test-collection-command.js <collection-slug>');
      console.log('Example: node test-collection-command.js tiny-buds40x40');
      return;
    }
    
    console.log(`🔍 Testing collection command for: ${testSlug}`);
    console.log('📍 Chain: Base (default)');
    console.log('');
    
    // Initialize NFT tracker
    await collectionCommand.initialize();
    
    // Fetch collection information
    console.log('📊 Fetching collection info...');
    const collectionInfo = await collectionCommand.nftTracker.getCollectionInfoBySlug(testSlug, 'Base');
    
    if (collectionInfo) {
      console.log('✅ Collection info found:');
      console.log(`   Name: ${collectionInfo.name}`);
      console.log(`   Description: ${collectionInfo.description || 'N/A'}`);
      console.log(`   Twitter: ${collectionInfo.twitter_username || 'N/A'}`);
      console.log(`   Discord: ${collectionInfo.discord_url || 'N/A'}`);
      console.log(`   Website: ${collectionInfo.homepage_url || 'N/A'}`);
    } else {
      console.log('❌ No collection info found');
    }
    
    console.log('');
    
    // Fetch collection stats
    console.log('📈 Fetching collection stats...');
    const stats = await collectionCommand.nftTracker.getCollectionStatsBySlug(testSlug, 'Base');
    
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
    const creatorFees = await collectionCommand.nftTracker.getCollectionCreatorFees(testSlug, 'Base');
    
    if (creatorFees) {
      console.log('✅ Creator fees info found:');
      console.log(`   Percentage: ${creatorFees.percentage !== null ? creatorFees.percentage + '%' : 'null'}`);
      console.log(`   Is Enforced: ${creatorFees.is_enforced}`);
      console.log(`   Is Optional: ${creatorFees.is_optional}`);
    } else {
      console.log('❌ No creator fees info found');
    }
    
    console.log('');
    console.log('✅ Collection command test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await collectionCommand.disconnect();
    process.exit(0);
  }
}

// Run the test
testCollectionCommand();
