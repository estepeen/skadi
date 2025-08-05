const config = require('./config');

async function testOpenSeaWalletActivity() {
  console.log('🧪 Testing OpenSea API v2 Wallet Activity...');
  
  // Test with a known wallet (STPN)
  const testWallet = '0x834711f749fe36dc4a5ae135267b88d0aaad8f3d';
  
  try {
    const apiKey = config.opensea.apiKey;
    
    console.log(`🔍 Testing OpenSea Stream API for wallet: ${testWallet}`);
    
    // Test OpenSea Stream API (WebSocket)
    const WebSocket = require('ws');
    const ws = new WebSocket('wss://stream.openseabeta.com/socket/websocket');
    
    ws.on('open', function open() {
      console.log('✅ Connected to OpenSea Stream API');
      
      // Subscribe to wallet events
      const subscribeMessage = {
        event: 'phx_join',
        topic: `account:${testWallet}`,
        payload: {},
        ref: 0
      };
      
      ws.send(JSON.stringify(subscribeMessage));
      console.log('📡 Subscribed to wallet events');
      
      // Close after 10 seconds
      setTimeout(() => {
        ws.close();
        console.log('🔌 Disconnected from Stream API');
      }, 10000);
    });
    
    ws.on('message', function message(data) {
      console.log('📨 Received:', data.toString());
    });
    
    ws.on('error', function error(err) {
      console.error('❌ WebSocket error:', err.message);
    });
    
    return; // Skip the rest of the function
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testOpenSeaWalletActivity(); 