#!/usr/bin/env node
require('dotenv').config();

console.log('🔧 NFT Tracker Bot - Configuration Check');
console.log('='.repeat(50));

// Check environment variables
console.log('\n🔑 Environment Variables:');
console.log(`   DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`   DISCORD_CHANNEL_ID: ${process.env.DISCORD_CHANNEL_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`   DISCORD_NFTS_ROLE_ID: ${process.env.DISCORD_NFTS_ROLE_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`   OPENSEA_API_KEY: ${process.env.OPENSEA_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   SCAN_INTERVAL: ${process.env.SCAN_INTERVAL ? '✅ Set' : '❌ Missing'}`);

// Check config file
try {
  const config = require('./config');
  
  console.log('\n⚙️  Configuration File:');
  console.log(`   Discord Bot Token: ${config.discord.botToken ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Discord Channel ID: ${config.discord.channelId ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Discord NFTs Role ID: ${config.discord.nftsRoleId ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   OpenSea API Key: ${config.opensea.apiKey ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Scan Interval: ${config.scanInterval}ms (${config.scanInterval / 1000 / 60} minutes)`);
  console.log(`   CSV File: ${config.csvFile}`);
  
  console.log('\n🔑 API Configuration:');
  if (config.opensea.apiKey) {
    console.log('   ✅ OpenSea API: Configured');
  } else {
    console.log('   ❌ OpenSea API: Not configured (required)');
  }
  
  const fs = require('fs');
  if (fs.existsSync(config.csvFile)) {
    const csvContent = fs.readFileSync(config.csvFile, 'utf8');
    const lines = csvContent.trim().split('\n');
    const walletCount = lines.length - 1; // Subtract header line
    
    console.log('\n👥 Wallets Configuration:');
    console.log(`   CSV File: ${config.csvFile} ✅`);
    console.log(`   Wallet Count: ${walletCount}`);
    
    if (walletCount > 0) {
      console.log('   First few wallets:');
      lines.slice(1, Math.min(4, lines.length)).forEach((line, index) => {
        const [address, name] = line.split(',');
        console.log(`     ${index + 1}. ${name || 'Unnamed'} (${address})`);
      });
    }
  } else {
    console.log('\n❌ CSV file not found:', config.csvFile);
  }
  
} catch (error) {
  console.log('\n❌ Error reading config:', error.message);
}

console.log('\n' + '='.repeat(50));
console.log('✅ Configuration check complete!'); 