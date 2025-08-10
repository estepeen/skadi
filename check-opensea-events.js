#!/usr/bin/env node

const config = require('./config');
const fetch = require('node-fetch');

async function checkOpenSeaEvents() {
  console.log('🔍 OpenSea Events Check Script');
  console.log('='.repeat(50));
  
  // Check configuration
  console.log('📋 1. Configuration Check:');
  console.log(`   OpenSea API Key: ${config.opensea.apiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   CSV File: ${config.csvFile}`);
  
  if (!config.opensea.apiKey) {
    console.log('❌ OpenSea API key is missing!');
    return;
  }
  
  // Read wallets from CSV
  console.log('\n👥 2. Reading Wallets:');
  const fs = require('fs');
  
  if (!fs.existsSync(config.csvFile)) {
    console.log(`❌ ${config.csvFile} not found!`);
    return;
  }
  
  const csvContent = fs.readFileSync(config.csvFile, 'utf8');
  const lines = csvContent.trim().split('\n');
  const wallets = lines.slice(1).map(line => {
    const [address, name] = line.split(',');
    return { address, name };
  });
  
  console.log(`✅ Found ${wallets.length} wallets`);
  
  // Test OpenSea API access
  console.log('\n🔗 3. Testing OpenSea API:');
  try {
    const response = await fetch('https://api.opensea.io/api/v2/collections?limit=1', {
      headers: {
        'X-API-KEY': config.opensea.apiKey,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log('✅ OpenSea API is accessible');
      console.log(`   Status: ${response.status}`);
      console.log(`   Rate limit remaining: ${response.headers.get('x-ratelimit-remaining') || 'Unknown'}`);
    } else {
      console.log(`❌ OpenSea API error: ${response.status}`);
      console.log(`   Response: ${await response.text()}`);
    }
  } catch (error) {
    console.log('❌ OpenSea API connection failed:', error.message);
  }
  
  // Check recent events for first few wallets
  console.log('\n📊 4. Checking Recent Events:');
  const walletsToCheck = wallets.slice(0, 3); // Check first 3 wallets
  
  for (const wallet of walletsToCheck) {
    console.log(`\n🔍 Checking ${wallet.name} (${wallet.address.substring(0, 10)}...)`);
    
    try {
      // Check for recent events
      const eventResponse = await fetch(`https://api.opensea.io/api/v2/events/accounts/${wallet.address}?event_type=sale&event_type=mint&limit=5`, {
        headers: {
          'X-API-KEY': config.opensea.apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (eventResponse.ok) {
        const eventData = await eventResponse.json();
        const events = eventData.asset_events || [];
        
        console.log(`   ✅ Found ${events.length} recent events`);
        
        if (events.length > 0) {
          events.slice(0, 2).forEach((event, index) => {
            const timestamp = new Date(event.event_timestamp * 1000).toISOString();
            const type = event.event_type;
            const nftName = event.nft?.name || 'Unknown';
            const collection = event.nft?.collection || 'Unknown';
            
            console.log(`     Event ${index + 1}: ${type} - ${nftName} (${collection})`);
            console.log(`       Time: ${timestamp}`);
            console.log(`       Transaction: ${event.transaction?.substring(0, 20)}...`);
          });
        }
      } else {
        console.log(`   ❌ Failed to fetch events: ${eventResponse.status}`);
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error checking events: ${error.message}`);
    }
  }
  
  // Check if bot is processing events
  console.log('\n🤖 5. Bot Event Processing Check:');
  
  // Check if bot.log exists and look for OpenSea activity
  if (fs.existsSync('bot.log')) {
    const logContent = fs.readFileSync('bot.log', 'utf8');
    const lines = logContent.split('\n');
    
    // Look for OpenSea related logs
    const openSeaLogs = lines.filter(line => 
      line.includes('OpenSea') || 
      line.includes('Checking') || 
      line.includes('Found') ||
      line.includes('Processing')
    );
    
    if (openSeaLogs.length > 0) {
      console.log('✅ Found OpenSea activity in bot logs:');
      openSeaLogs.slice(-5).forEach(line => {
        console.log(`   ${line.trim()}`);
      });
    } else {
      console.log('❌ No OpenSea activity found in bot logs');
    }
    
    // Look for notification logs
    const notificationLogs = lines.filter(line => 
      line.includes('Discord') || 
      line.includes('notification') ||
      line.includes('sent successfully')
    );
    
    if (notificationLogs.length > 0) {
      console.log('\n📨 Found notification logs:');
      notificationLogs.slice(-5).forEach(line => {
        console.log(`   ${line.trim()}`);
      });
    } else {
      console.log('\n❌ No notification logs found');
    }
  } else {
    console.log('❌ bot.log not found - bot might not be logging to file');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 OpenSea events check complete!');
  console.log('\n💡 If no events are found:');
  console.log('   - Check if wallets have recent activity');
  console.log('   - Verify OpenSea API key is valid');
  console.log('   - Check bot logs for errors');
  console.log('   - Run: node simulate-nft-event.js to test notifications');
}
