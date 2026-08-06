const fs = require('fs');
const path = require('path');

const OPENSEA_KEY_FILE = path.join(__dirname, 'data', 'opensea-key.json');

// The env key is optional - without one the bot mints and caches a free key, so
// the cache file has to be consulted before reporting "Not set". Never print any
// part of the key itself.
function describeOpenseaKey(envKey) {
  if (envKey) return 'Set (env)';

  try {
    if (!fs.existsSync(OPENSEA_KEY_FILE)) return 'Not set';

    const cached = JSON.parse(fs.readFileSync(OPENSEA_KEY_FILE, 'utf8'));
    if (!cached || typeof cached.api_key !== 'string' || cached.api_key.length === 0) {
      return 'Not set';
    }

    const expiresAt = new Date(cached.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) return 'Set (auto, expiry unknown)';

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) return 'Not set (auto key expired)';

    const days = Math.floor(remainingMs / 86400000);
    const hours = Math.floor((remainingMs % 86400000) / 3600000);
    return `Set (auto, expires in ${days > 0 ? `${days}d` : `${hours}h`})`;
  } catch (error) {
    return `Unknown (${error.message})`;
  }
}

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
    console.log(`   OpenSea API key: ${describeOpenseaKey(config.opensea.apiKey)}`);
  } catch (error) {
    console.log('❌ Error reading config:', error.message);
  }
  
  // Check wallets
  try {
    const config = require('./config'); // Re-require config to access csvFile
    const csvContent = fs.readFileSync(config.csvFile, 'utf8');
    const lines = csvContent.trim().split('\n');
    const walletCount = lines.length - 1; // Subtract header
    // Count only — enumerating every address with its label dumped the whole
    // watchlist to stdout, and with --monitor it repeated every 60 seconds.
    console.log(`\n👥 Wallets: ${walletCount} wallets loaded`);
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