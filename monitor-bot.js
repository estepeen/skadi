const fs = require('fs');
const path = require('path');

function checkBotStatus() {
  console.log('🤖 NFT Tracker Bot Status Check');
  console.log('='.repeat(40));
  
  // Check if bot process is running
  const { exec } = require('child_process');
  exec('ps aux | grep "node index.js" | grep -v grep', (error, stdout, stderr) => {
    if (stdout) {
      console.log('✅ Bot is running');
      const lines = stdout.trim().split('\n');
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        const pid = parts[1];
        const cpu = parts[2];
        const mem = parts[3];
        console.log(`   PID: ${pid}, CPU: ${cpu}%, Memory: ${mem}%`);
      });
    } else {
      console.log('❌ Bot is not running');
    }
  });
  
  // Check config
  try {
    const config = require('./config');
    console.log('\n📋 Configuration:');
    console.log(`   Scan interval: ${config.scanInterval / 1000 / 60} minutes`);
    console.log(`   CSV file: ${config.csvFile}`);
    console.log(`   Discord enabled: ${config.discord.botToken ? 'Yes' : 'No'}`);
    console.log(`   OpenSea API key: ${config.opensea.apiKey ? 'Set' : 'Not set'}`);
  } catch (error) {
    console.log('❌ Error reading config:', error.message);
  }
  
  // Check wallets
  try {
    const config = require('./config'); // Re-require config to access csvFile
    const csvContent = fs.readFileSync(config.csvFile, 'utf8');
    const lines = csvContent.trim().split('\n');
    const walletCount = lines.length - 1; // Subtract header
    console.log(`\n👥 Wallets: ${walletCount} wallets loaded`);
    
    if (walletCount > 0) {
      console.log('   Wallets:');
      lines.slice(1).forEach(line => {
        const [address, name] = line.split(',');
        console.log(`   - ${name} (${address})`);
      });
    }
  } catch (error) {
    console.log('❌ Error reading wallets:', error.message);
  }
  
  console.log('\n' + '='.repeat(40));
  console.log('🔄 Bot will check for new events every 5 minutes');
  console.log('📊 Only NEW events will be processed (no historical data)');
  console.log('🎯 Tracking: Ethereum & Base chains');
  console.log('💬 Discord notifications enabled');
}

// Run status check
checkBotStatus();

// Optional: Run periodic status check
if (process.argv.includes('--monitor')) {
  console.log('\n🔍 Starting continuous monitoring...');
  setInterval(checkBotStatus, 60000); // Check every minute
} 