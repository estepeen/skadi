const fetch = require('node-fetch');
const config = require('./config');

async function testCollectionAPI() {
  try {
    console.log('🧪 Testing Collection API directly...');
    console.log('='.repeat(50));
    
    // Test collection slug - replace with the one you want to test
    const testSlug = process.argv[2];
    
    if (!testSlug) {
      console.log('❌ Please provide a collection slug as argument');
      console.log('Usage: node test-collection-simple.js <collection-slug>');
      console.log('Example: node test-collection-simple.js tiny-buds40x40');
      return;
    }
    
    console.log(`🔍 Testing collection API for: ${testSlug}`);
    console.log('📍 Chain: base (default)');
    console.log('');
    
    // 1) Collection detail
    console.log('📊 Fetching collection info...');
    const colRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(testSlug)}?chain=base`, {
      headers: { 
        'Accept': 'application/json', 
        'X-API-KEY': config.opensea.apiKey 
      }
    });
    
    if (!colRes.ok) {
      throw new Error(`Get Collection failed: ${colRes.status} ${colRes.statusText}`);
    }
    const collection = await colRes.json();
    
    console.log('✅ Collection info found:');
    console.log(`   Name: ${collection.name || testSlug}`);
    console.log(`   Total Supply: ${collection.total_supply || 'N/A'}`);
    console.log(`   Twitter: ${collection.twitter_username || 'N/A'}`);
    console.log(`   Discord: ${collection.discord_url || 'N/A'}`);
    console.log(`   Website: ${collection.project_url || 'N/A'}`);
    
    if (collection.fees && Array.isArray(collection.fees)) {
      console.log(`   Fees: ${collection.fees.length} fee entries found`);
      collection.fees.forEach((fee, index) => {
        console.log(`     Fee ${index + 1}: ${fee.fee}% → ${fee.recipient?.slice(0,6)}…${fee.recipient?.slice(-4)} (required: ${fee.required})`);
      });
    }
    
    console.log('');
    
    // 2) Collection stats
    console.log('📈 Fetching collection stats...');
    const statsRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(testSlug)}/stats?chain=base`, {
      headers: { 
        'Accept': 'application/json', 
        'X-API-KEY': config.opensea.apiKey 
      }
    });
    
    if (!statsRes.ok) {
      throw new Error(`Get Collection Stats failed: ${statsRes.status} ${statsRes.statusText}`);
    }
    const stats = await statsRes.json();
    
    console.log('✅ Collection stats found:');
    if (stats.total) {
      console.log(`   Floor Price: ${stats.total.floor_price || 'N/A'} ETH`);
      console.log(`   Total Volume: ${stats.total.volume || 'N/A'} ETH`);
      console.log(`   Total Sales: ${stats.total.sales || 'N/A'}`);
      console.log(`   Distinct Owners: ${stats.total.distinct_owner_count || 'N/A'}`);
      console.log(`   Num Owners: ${stats.total.num_owners || 'N/A'}`);
      console.log(`   Supply: ${stats.total.supply || 'N/A'}`);
    } else {
      console.log('   No total stats found in response');
      console.log('   Raw response:', JSON.stringify(stats, null, 2));
    }
    
    console.log('');
    console.log('✅ Collection API test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('401')) {
      console.log('💡 Tip: Check your OpenSea API key in config.js');
    } else if (error.message.includes('404')) {
      console.log('💡 Tip: Collection might not exist on Base chain, try Ethereum');
    } else if (error.message.includes('429')) {
      console.log('💡 Tip: Rate limit reached, wait a bit and try again');
    }
  }
}

// Run the test
testCollectionAPI();
