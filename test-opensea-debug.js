const config = require('./config');

async function testOpenSeaDebug() {
  console.log('🧪 Debugging OpenSea API v2 events...');
  
  // Test with a known wallet (STPN)
  const testWallet = '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d';
  
  try {
    const apiKey = config.opensea.apiKey;
    
    console.log(`🔍 Fetching ALL events for wallet: ${testWallet}`);
    
    // Bez filtru na event_type
    const response = await fetch(`https://api.opensea.io/api/v2/events/accounts/${testWallet}?limit=10`, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Found ${data.asset_events?.length || 0} events`);
      
      if (data.asset_events && data.asset_events.length > 0) {
        console.log('\n📊 Raw event data:');
        
        for (let i = 0; i < data.asset_events.length; i++) {
          const event = data.asset_events[i];
          console.log(`\n--- Event ${i + 1} ---`);
          console.log(JSON.stringify(event, null, 2));
        }
      }
    } else {
      console.log(`❌ Error: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testOpenSeaDebug(); 