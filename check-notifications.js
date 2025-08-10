#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Notification Check Script');
console.log('='.repeat(50));

// Check if bot is running
console.log('🤖 1. Bot Status Check:');
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
    console.log('💡 Start the bot with: node index.js');
    return;
  }
  
  // Continue with other checks
  checkLogs();
});

function checkLogs() {
  console.log('\n📋 2. Log File Check:');
  
  // Check for bot.log
  if (fs.existsSync('bot.log')) {
    console.log('✅ bot.log exists');
    const stats = fs.statSync('bot.log');
    const fileSize = (stats.size / 1024).toFixed(2);
    console.log(`   Size: ${fileSize} KB`);
    console.log(`   Last modified: ${stats.mtime}`);
    
    // Read last 20 lines
    const content = fs.readFileSync('bot.log', 'utf8');
    const lines = content.split('\n');
    const lastLines = lines.slice(-20).filter(line => line.trim());
    
    console.log('\n📝 Last 20 log lines:');
    lastLines.forEach(line => {
      console.log(`   ${line}`);
    });
  } else {
    console.log('❌ bot.log not found');
    console.log('💡 Bot might not be logging to file');
  }
  
  // Check for other log files
  const logFiles = ['nft-tracker.log', 'discord.log', 'error.log'];
  logFiles.forEach(logFile => {
    if (fs.existsSync(logFile)) {
      console.log(`✅ ${logFile} exists`);
    }
  });
  
  checkEnvironment();
}

function checkEnvironment() {
  console.log('\n🌍 3. Environment Check:');
  
  // Check .env file
  if (fs.existsSync('.env')) {
    console.log('✅ .env file exists');
    const envContent = fs.readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    console.log('   Environment variables:');
    lines.forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key] = line.split('=');
        if (key) {
          const value = process.env[key];
          if (value) {
            console.log(`     ${key}: ${value.substring(0, 10)}...`);
          } else {
            console.log(`     ${key}: ❌ Not set`);
          }
        }
      }
    });
  } else {
    console.log('❌ .env file not found');
    console.log('💡 Create .env file with your Discord credentials');
  }
  
  // Check config
  try {
    const config = require('./config');
    console.log('\n📋 4. Config Check:');
    console.log(`   Discord Bot Token: ${config.discord.botToken ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Discord Channel ID: ${config.discord.channelId ? '✅ Set' : '❌ Missing'}`);
    console.log(`   OpenSea API Key: ${config.opensea.apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Etherscan API Key: ${config.etherscan.apiKey ? '✅ Set' : '❌ Missing'}`);
  } catch (error) {
    console.log('❌ Error reading config:', error.message);
  }
  
  checkWallets();
}

function checkWallets() {
  console.log('\n👥 5. Wallets Check:');
  
  if (fs.existsSync('wallets.csv')) {
    const csvContent = fs.readFileSync('wallets.csv', 'utf8');
    const lines = csvContent.trim().split('\n');
    const walletCount = lines.length - 1; // Subtract header
    
    console.log(`✅ Found ${walletCount} wallets in wallets.csv`);
    
    if (walletCount > 0) {
      console.log('   Sample wallets:');
      lines.slice(1, 4).forEach(line => {
        const [address, name] = line.split(',');
        console.log(`     ${name}: ${address.substring(0, 10)}...`);
      });
      
      if (walletCount > 3) {
        console.log(`     ... and ${walletCount - 3} more`);
      }
    }
  } else {
    console.log('❌ wallets.csv not found');
  }
  
  checkRecentActivity();
}

function checkRecentActivity() {
  console.log('\n📊 6. Recent Activity Check:');
  
  // Check data directory
  if (fs.existsSync('data')) {
    console.log('✅ data/ directory exists');
    
    const dataFiles = fs.readdirSync('data');
    if (dataFiles.length > 0) {
      console.log('   Data files:');
      dataFiles.forEach(file => {
        const filePath = path.join('data', file);
        const stats = fs.statSync(filePath);
        const fileSize = (stats.size / 1024).toFixed(2);
        console.log(`     ${file}: ${fileSize} KB, modified: ${stats.mtime}`);
      });
    }
  } else {
    console.log('❌ data/ directory not found');
  }
  
  // Check purchases.json
  if (fs.existsSync('data/purchases.json')) {
    try {
      const purchases = JSON.parse(fs.readFileSync('data/purchases.json', 'utf8'));
      const purchaseCount = Object.keys(purchases).length;
      console.log(`   Purchase records: ${purchaseCount}`);
    } catch (error) {
      console.log('   ❌ Error reading purchases.json:', error.message);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 Notification check complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Run: node debug-discord.js');
  console.log('   2. Check bot logs: tail -f bot.log');
  console.log('   3. Verify Discord bot permissions');
  console.log('   4. Test with: node test-discord-connection.js');
}
