const fetch = require('node-fetch');
const config = require('./config');

async function testFullCollectionData() {
  try {
    console.log('🧪 Testing Full Collection Data from OpenSea API...');
    console.log('='.repeat(60));
    
    const testSlug = process.argv[2] || 'tiny-buds40x40';
    const chain = process.argv[3] || 'base';
    
    console.log(`🔍 Testing collection: ${testSlug}`);
    console.log(`📍 Chain: ${chain}`);
    console.log('');
    
    // 1) Collection detail - všechna dostupná data
    console.log('📊 1. COLLECTION DETAIL - All available data:');
    console.log('-'.repeat(40));
    
    const colRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(testSlug)}?chain=${chain}`, {
      headers: { 
        'Accept': 'application/json', 
        'X-API-KEY': config.opensea.apiKey 
      }
    });
    
    if (!colRes.ok) {
      throw new Error(`Get Collection failed: ${colRes.status} ${colRes.statusText}`);
    }
    
    const collection = await colRes.json();
    console.log('✅ Collection info found!');
    console.log('');
    
    // Vypíšeme všechna dostupná pole
    console.log('📋 Available fields in collection response:');
    Object.keys(collection).forEach(key => {
      const value = collection[key];
      if (value === null || value === undefined) {
        console.log(`   ${key}: null/undefined`);
      } else if (typeof value === 'object') {
        console.log(`   ${key}: [Object] - ${JSON.stringify(value, null, 2)}`);
      } else if (typeof value === 'string' && value.length > 100) {
        console.log(`   ${key}: "${value.substring(0, 100)}..." (${value.length} chars)`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });
    
    console.log('');
    
    // 2) Collection stats - všechna dostupná data
    console.log('📈 2. COLLECTION STATS - All available data:');
    console.log('-'.repeat(40));
    
    const statsRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(testSlug)}/stats?chain=${chain}`, {
      headers: { 
        'Accept': 'application/json', 
        'X-API-KEY': config.opensea.apiKey 
      }
    });
    
    if (!statsRes.ok) {
      throw new Error(`Get Collection Stats failed: ${statsRes.status} ${statsRes.statusText}`);
    }
    
    const stats = await statsRes.json();
    console.log('✅ Collection stats found!');
    console.log('');
    
    // Vypíšeme všechna dostupná pole
    console.log('📋 Available fields in stats response:');
    Object.keys(stats).forEach(key => {
      const value = stats[key];
      if (value === null || value === undefined) {
        console.log(`   ${key}: null/undefined`);
      } else if (typeof value === 'object') {
        console.log(`   ${key}: [Object] - ${JSON.stringify(value, null, 2)}`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });
    
    console.log('');
    
    // 3) Collection events - poslední události
    console.log('🔄 3. COLLECTION EVENTS - Recent activity:');
    console.log('-'.repeat(40));
    
    try {
      const eventsRes = await fetch(`https://api.opensea.io/api/v2/events/collections/${encodeURIComponent(testSlug)}?chain=${chain}&event_type=item_sold&limit=5`, {
        headers: { 
          'Accept': 'application/json', 
          'X-API-KEY': config.opensea.apiKey 
        }
      });
      
      if (eventsRes.ok) {
        const events = await eventsRes.json();
        console.log('✅ Collection events found!');
        console.log(`   Found ${events.asset_events?.length || 0} recent sales`);
        
        if (events.asset_events && events.asset_events.length > 0) {
          console.log('   Latest sale:');
          const latest = events.asset_events[0];
          console.log(`     Token: ${latest.asset?.name || 'Unknown'}`);
          console.log(`     Price: ${latest.payment?.amount ? Number(latest.payment.amount) / Math.pow(10, latest.payment.decimals || 18) : 'N/A'} ETH`);
          console.log(`     Time: ${latest.event_timestamp || 'N/A'}`);
        }
      } else {
        console.log(`⚠️ Events API returned: ${eventsRes.status}`);
      }
    } catch (error) {
      console.log(`⚠️ Could not fetch events: ${error.message}`);
    }
    
    console.log('');
    
    // 4) Collection assets - ukázka NFT
    console.log('🖼️ 4. COLLECTION ASSETS - Sample NFTs:');
    console.log('-'.repeat(40));
    
    try {
      const assetsRes = await fetch(`https://api.opensea.io/api/v2/assets?collection=${encodeURIComponent(testSlug)}&chain=${chain}&limit=3`, {
        headers: { 
          'Accept': 'application/json', 
          'X-API-KEY': config.opensea.apiKey 
        }
      });
      
      if (assetsRes.ok) {
        const assets = await assetsRes.json();
        console.log('✅ Collection assets found!');
        console.log(`   Found ${assets.assets?.length || 0} sample NFTs`);
        
        if (assets.assets && assets.assets.length > 0) {
          console.log('   Sample NFTs:');
          assets.assets.forEach((asset, index) => {
            console.log(`     ${index + 1}. ${asset.name || `#${asset.token_id}`}`);
            console.log(`        Image: ${asset.image_url || 'N/A'}`);
            console.log(`        Last sale: ${asset.last_sale?.payment?.amount ? Number(asset.last_sale.payment.amount) / Math.pow(10, asset.last_sale.payment.decimals || 18) : 'N/A'} ETH`);
          });
        }
      } else {
        console.log(`⚠️ Assets API returned: ${assetsRes.status}`);
      }
    } catch (error) {
      console.log(`⚠️ Could not fetch assets: ${error.message}`);
    }
    
    console.log('');
    console.log('✅ Full collection data test completed!');
    console.log('');
    console.log('💡 Now you can choose which fields to include in your Discord embed.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('401')) {
      console.log('💡 Tip: Check your OpenSea API key in config.js');
    } else if (error.message.includes('404')) {
      console.log('💡 Tip: Collection might not exist on this chain, try another one');
    } else if (error.message.includes('429')) {
      console.log('💡 Tip: Rate limit reached, wait a bit and try again');
    }
  }
}

// Run the test
testFullCollectionData();
