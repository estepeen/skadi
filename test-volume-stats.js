const NFTTracker = require('./services/nftTracker');
const config = require('./config');

async function testVolumeStats() {
  console.log('🧪 Testing Volume and Stats Functionality...\n');
  
  const nftTracker = new NFTTracker();
  
  // Test with a known collection (THE DROPZONE from the image)
  const testContract = '0x1234567890123456789012345678901234567890'; // Replace with actual contract
  const testSlug = 'dropzone-mcade'; // From the image URL
  const chainName = 'Base';
  
  try {
    console.log(`🔍 Testing collection stats for: ${testSlug}`);
    console.log(`📍 Chain: ${chainName}`);
    console.log(`📋 Contract: ${testContract}\n`);
    
    // Test 1: Get collection info
    console.log('📊 Test 1: Getting collection info...');
    const collectionInfo = await nftTracker.getCollectionInfo(testContract, chainName);
    if (collectionInfo) {
      console.log(`✅ Collection found: ${collectionInfo.name}`);
      console.log(`🔗 Slug: ${collectionInfo.slug}`);
      console.log(`🐦 Twitter: ${collectionInfo.twitter_username || 'N/A'}`);
      console.log(`📱 Discord: ${collectionInfo.discord_url || 'N/A'}`);
    } else {
      console.log('❌ Collection info not found');
    }
    console.log('');
    
    // Test 2: Get collection stats
    console.log('📈 Test 2: Getting collection stats...');
    const stats = await nftTracker.getCollectionStats(testContract, chainName);
    if (stats) {
      console.log('✅ Collection stats found:');
      console.log(`🎯 Floor Price: ${stats.floor_price || 'N/A'} ETH`);
      console.log(`📊 Total Volume: ${stats.total_volume || 'N/A'} ETH`);
      console.log(`🛒 Total Sales: ${stats.total_sales || 'N/A'}`);
      console.log(`👥 Owners: ${stats.num_owners || 'N/A'}`);
      console.log(`💰 Average Price: ${stats.average_price || 'N/A'} ETH`);
      console.log(`💎 Market Cap: ${stats.market_cap || 'N/A'} ETH`);
      console.log('');
      console.log('📈 Volume Data:');
      console.log(`   24h Volume: ${stats.one_day_volume || 'N/A'} ETH`);
      console.log(`   7d Volume: ${stats.seven_day_volume || 'N/A'} ETH`);
      console.log(`   30d Volume: ${stats.thirty_day_volume || 'N/A'} ETH`);
      console.log('');
      console.log('📊 Sales Data:');
      console.log(`   24h Sales: ${stats.one_day_sales || 'N/A'}`);
      console.log(`   7d Sales: ${stats.seven_day_sales || 'N/A'}`);
      console.log(`   30d Sales: ${stats.thirty_day_sales || 'N/A'}`);
      console.log('');
      console.log('📈 Volume Changes:');
      console.log(`   24h Change: ${stats.one_day_volume_change !== undefined ? (stats.one_day_volume_change * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`   7d Change: ${stats.seven_day_volume_change !== undefined ? (stats.seven_day_volume_change * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`   30d Change: ${stats.thirty_day_volume_change !== undefined ? (stats.thirty_day_volume_change * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log('');
      console.log('📊 Volume Diffs:');
      console.log(`   24h Diff: ${stats.one_day_volume_diff || 'N/A'} ETH`);
      console.log(`   7d Diff: ${stats.seven_day_volume_diff || 'N/A'} ETH`);
      console.log(`   30d Diff: ${stats.thirty_day_volume_diff || 'N/A'} ETH`);
    } else {
      console.log('❌ Collection stats not found');
    }
    console.log('');
    
    // Test 3: Test with OpenSea API v2 directly
    console.log('🔗 Test 3: Testing OpenSea API v2 directly...');
    const apiKey = config.opensea.apiKey;
    if (apiKey) {
      try {
        const response = await fetch(`https://api.opensea.io/api/v2/collections/${testSlug}/stats?chain=base`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ OpenSea API v2 response:');
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`❌ OpenSea API v2 failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log(`❌ OpenSea API v2 error: ${error.message}`);
      }
    } else {
      console.log('⚠️ No OpenSea API key configured');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
  
  console.log('\n✅ Volume and Stats test completed!');
}

// Run the test
testVolumeStats().catch(console.error); 