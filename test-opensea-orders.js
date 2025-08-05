const config = require('./config');

async function testOpenSeaOrders() {
  console.log('🧪 Testing OpenSea API v2 Orders endpoint...');
  
  // Test with a known wallet (STPN)
  const testWallet = '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d';
  
  try {
    const apiKey = config.opensea.apiKey;
    
    console.log(`🔍 Step 1: Fetching events for wallet: ${testWallet}`);
    
    // First, get events to find order hashes
    const eventsResponse = await fetch(`https://api.opensea.io/api/v2/events/accounts/${testWallet}?event_type=sale&event_type=transfer&event_type=mint&limit=10`, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      }
    });
    
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      console.log(`✅ Found ${eventsData.asset_events?.length || 0} events`);
      
      if (eventsData.asset_events && eventsData.asset_events.length > 0) {
        // Look for events with order hashes
        const eventsWithOrders = eventsData.asset_events.filter(event => 
          event.order_hash || event.transaction
        );
        
        console.log(`📊 Found ${eventsWithOrders.length} events with order/transaction data`);
        
        for (let i = 0; i < Math.min(3, eventsWithOrders.length); i++) {
          const event = eventsWithOrders[i];
          console.log(`\n--- Event ${i + 1} ---`);
          console.log(`Type: ${event.event_type}`);
          console.log(`Transaction: ${event.transaction || 'N/A'}`);
          console.log(`Order Hash: ${event.order_hash || 'N/A'}`);
          
          // If we have an order hash, try to get order details
          if (event.order_hash) {
            console.log(`🔍 Step 2: Fetching order details for hash: ${event.order_hash}`);
            
            // Try different chains and protocols
            const chains = ['ethereum', 'base', 'polygon'];
            const protocols = [
              '0x0000000000000068f116a894984e2db1123eb395', // Seaport
              '0x00000000000001ad428e4906aE43D8F9852d0dD6'  // Seaport 1.4
            ];
            
            for (const chain of chains) {
              for (const protocol of protocols) {
                try {
                  const orderResponse = await fetch(`https://api.opensea.io/api/v2/orders/chain/${chain}/protocol/${protocol}/order_hash/${event.order_hash}`, {
                    method: 'GET',
                    headers: {
                      'X-API-KEY': apiKey,
                      'Accept': 'application/json'
                    }
                  });
                  
                  if (orderResponse.ok) {
                    const orderData = await orderResponse.json();
                    console.log(`✅ Found order on ${chain} with protocol ${protocol}:`);
                    
                    if (orderData.order) {
                      const order = orderData.order;
                      console.log(`  Order Hash: ${order.order_hash}`);
                      
                      if (order.price && order.price.current) {
                        const price = order.price.current;
                        const priceValue = parseFloat(price.value) / Math.pow(10, price.decimals);
                        console.log(`  Price: ${priceValue} ${price.currency}`);
                      }
                      
                      if (order.protocol_data && order.protocol_data.parameters) {
                        const params = order.protocol_data.parameters;
                        console.log(`  Offerer: ${params.offerer}`);
                        console.log(`  Start Time: ${new Date(parseInt(params.startTime) * 1000).toLocaleString()}`);
                        console.log(`  End Time: ${new Date(parseInt(params.endTime) * 1000).toLocaleString()}`);
                        
                        // Parse offer (what's being sold)
                        if (params.offer && params.offer.length > 0) {
                          const offer = params.offer[0];
                          console.log(`  Offer: Token ${offer.token}, ID ${offer.identifierOrCriteria}, Amount ${offer.startAmount}`);
                        }
                        
                        // Parse consideration (what's being paid)
                        if (params.consideration && params.consideration.length > 0) {
                          const consideration = params.consideration[0];
                          const considerationValue = parseFloat(consideration.startAmount) / Math.pow(10, 18);
                          console.log(`  Consideration: ${considerationValue} ETH to ${consideration.recipient}`);
                        }
                      }
                      
                      // Found the order, no need to try other combinations
                      break;
                    }
                  }
                } catch (error) {
                  // Continue to next combination
                }
              }
            }
          }
          
          // Add delay between events
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log('📭 No events found for this wallet');
      }
    } else {
      console.log(`❌ Error fetching events: ${eventsResponse.status} ${eventsResponse.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testOpenSeaOrders(); 