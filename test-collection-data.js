const config = require('./config');

// Funkce pro získání dat kolekce podle slug
async function getCollectionData(slug) {
  const apiKey = config.opensea.apiKey;
  const chain = 'base'; // Base chain
  
  console.log(`🔍 Testing collection slug: "${slug}"`);
  console.log(`📍 Chain: ${chain}`);
  console.log(`🔑 API Key: ${apiKey ? '✅ Set' : '❌ Missing'}`);
  
  if (!apiKey) {
    console.log('❌ OpenSea API key is missing in config.js');
    return;
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('📊 COLLECTION INFO');
  console.log('─'.repeat(60));
  
  // 1. Získat základní informace o kolekci
  try {
    const collectionResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}`, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log(`📊 Collection API response: ${collectionResponse.status} ${collectionResponse.statusText}`);
    
    if (collectionResponse.ok) {
      const collectionData = await collectionResponse.json();
      
      console.log(`✅ Collection found: "${collectionData.name || slug}"`);
      console.log(`🔗 Slug: ${collectionData.collection || slug}`);
      console.log(`📄 Description: ${collectionData.description ? collectionData.description.substring(0, 100) + '...' : 'N/A'}`);
      console.log(`🖼️ Image: ${collectionData.image_url || 'N/A'}`);
      console.log(`🏷️ Banner: ${collectionData.banner_image_url || 'N/A'}`);
      console.log(`👤 Owner: ${collectionData.owner || 'N/A'}`);
      console.log(`✅ Status: ${collectionData.safelist_status || 'N/A'}`);
      console.log(`📂 Category: ${collectionData.category || 'N/A'}`);
      console.log(`🌐 Website: ${collectionData.project_url || 'N/A'}`);
      console.log(`📚 Wiki: ${collectionData.wiki_url || 'N/A'}`);
      
      // Socialní sítě
      console.log(`\n📱 SOCIAL MEDIA:`);
      console.log(`🔗 Twitter: ${collectionData.twitter_username ? `@${collectionData.twitter_username}` : 'N/A'}`);
      console.log(`📱 Discord: ${collectionData.discord_url || 'N/A'}`);
      console.log(`📱 Telegram: ${collectionData.telegram_url || 'N/A'}`);
      console.log(`📸 Instagram: ${collectionData.instagram_username ? `@${collectionData.instagram_username}` : 'N/A'}`);
      
      // Contracts
      if (collectionData.contracts && collectionData.contracts.length > 0) {
        console.log(`\n📋 CONTRACTS:`);
        collectionData.contracts.forEach((contract, index) => {
          console.log(`  ${index + 1}. ${contract.address} (${contract.chain})`);
        });
      }
      
      // Fees
      if (collectionData.fees && collectionData.fees.length > 0) {
        console.log(`\n💰 FEES:`);
        collectionData.fees.forEach((fee, index) => {
          console.log(`  ${index + 1}. ${fee.fee}% to ${fee.recipient} (${fee.required ? 'required' : 'optional'})`);
        });
      }
      
      console.log(`\n📊 Full collection data:`, JSON.stringify(collectionData, null, 2));
      
    } else {
      console.log(`❌ Collection not found: ${collectionResponse.status} ${collectionResponse.statusText}`);
      return;
    }
  } catch (error) {
    console.log(`❌ Error fetching collection info: ${error.message}`);
    return;
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('📈 COLLECTION STATS');
  console.log('─'.repeat(60));
  
  // 2. Získat statistiky kolekce (floor price, volume, etc.)
  try {
    const statsResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}/stats?chain=${chain}`, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log(`📊 Stats API response: ${statsResponse.status} ${statsResponse.statusText}`);
    
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      
      console.log(`✅ Stats found for: "${slug}"`);
      
      if (statsData.total) {
        const total = statsData.total;
        console.log(`\n📊 TOTAL STATS:`);
        console.log(`💰 Floor Price: ${total.floor_price ? `${total.floor_price} ETH` : 'N/A'}`);
        console.log(`📈 Total Volume: ${total.volume ? `${total.volume} ETH` : 'N/A'}`);
        console.log(`🔄 Total Sales: ${total.sales || 'N/A'}`);
        console.log(`👥 Total Supply: ${total.supply || 'N/A'}`);
        console.log(`👤 Unique Owners: ${total.num_owners || 'N/A'}`);
        console.log(`📊 Average Price: ${total.average_price ? `${total.average_price} ETH` : 'N/A'}`);
        console.log(`📊 Median Price: ${total.median_price ? `${total.median_price} ETH` : 'N/A'}`);
        console.log(`📊 Min Price: ${total.min_price ? `${total.min_price} ETH` : 'N/A'}`);
        console.log(`📊 Max Price: ${total.max_price ? `${total.max_price} ETH` : 'N/A'}`);
      }
      
      if (statsData.intervals && statsData.intervals.length > 0) {
        console.log(`\n📅 INTERVAL STATS:`);
        statsData.intervals.forEach(interval => {
          console.log(`\n⏰ ${interval.interval.toUpperCase()}:`);
          console.log(`  📈 Volume: ${interval.volume ? `${interval.volume} ETH` : 'N/A'}`);
          console.log(`  📊 Sales: ${interval.sales || 'N/A'}`);
          console.log(`  💰 Average Price: ${interval.average_price ? `${interval.average_price} ETH` : 'N/A'}`);
          console.log(`  📊 Floor Price: ${interval.floor_price ? `${interval.floor_price} ETH` : 'N/A'}`);
          console.log(`  📈 Volume Change: ${interval.volume_change ? `${interval.volume_change}%` : 'N/A'}`);
          console.log(`  💰 Floor Price Change: ${interval.floor_price_change ? `${interval.floor_price_change}%` : 'N/A'}`);
        });
      }
      
      console.log(`\n📊 Full stats data:`, JSON.stringify(statsData, null, 2));
      
    } else {
      console.log(`❌ Stats not found: ${statsResponse.status} ${statsResponse.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error fetching stats: ${error.message}`);
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('🔄 RECENT SALES')
  console.log('─'.repeat(60));
  
  // 3. Získat nedávné prodeje
  try {
    const eventsResponse = await fetch(`https://api.opensea.io/api/v2/events/collections/${slug}?event_type=sale&limit=5&chain=${chain}`, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log(`📊 Events API response: ${eventsResponse.status} ${eventsResponse.statusText}`);
    
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      
      if (eventsData.asset_events && eventsData.asset_events.length > 0) {
        console.log(`✅ Found ${eventsData.asset_events.length} recent sales`);
        
        eventsData.asset_events.forEach((event, index) => {
          console.log(`\n💰 Sale ${index + 1}:`);
          console.log(`  🆔 Token ID: ${event.nft?.identifier || 'N/A'}`);
          console.log(`  💰 Price: ${event.payment?.quantity ? `${parseFloat(event.payment.quantity) / Math.pow(10, event.payment.decimals || 18)} ${event.payment.symbol || 'ETH'}` : 'N/A'}`);
          console.log(`  👤 Seller: ${event.seller || 'N/A'}`);
          console.log(`  👤 Buyer: ${event.buyer || 'N/A'}`);
          console.log(`  📅 Date: ${event.event_timestamp ? new Date(event.event_timestamp * 1000).toLocaleString() : 'N/A'}`);
          console.log(`  🔗 Transaction: ${event.transaction || 'N/A'}`);
        });
      } else {
        console.log(`❌ No recent sales found`);
      }
      
      console.log(`\n📊 Full events data:`, JSON.stringify(eventsData, null, 2));
      
    } else {
      console.log(`❌ Events not found: ${eventsResponse.status} ${eventsResponse.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error fetching events: ${error.message}`);
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('✅ TEST COMPLETED');
  console.log('─'.repeat(60));
}

// Funkce pro čtení inputu z terminalu
function readInput(prompt) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Main function
async function testCollection() {
  console.log('🚀 Collection Data Fetcher\n');
  console.log('─'.repeat(50));
  
  // Získat slug z command line argumentu nebo interaktivně
  let slug = process.argv[2];
  
  if (!slug) {
    console.log('📝 Enter collection slug (e.g., dxterminal, dropzone-mcade, cool-cats):');
    slug = await readInput('🔍 Slug: ');
  }
  
  if (!slug) {
    console.log('❌ No slug provided. Exiting...');
    return;
  }
  
  console.log(`\n🎯 Fetching data for: "${slug}"`);
  console.log('─'.repeat(50));
  
  await getCollectionData(slug);
  
  // Možnost pokračovat s další kolekcí
  console.log('\n' + '─'.repeat(50));
  const continueTest = await readInput('🔄 Test another collection? (y/n): ');
  
  if (continueTest.toLowerCase() === 'y' || continueTest.toLowerCase() === 'yes') {
    console.log('\n');
    await testCollection();
  } else {
    console.log('👋 Goodbye!');
  }
}

// Run the test
testCollection().catch(console.error); 