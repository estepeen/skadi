const CSVReader = require('./utils/csvReader');
const NFTTracker = require('./services/nftTracker');
const config = require('./config');

let nftTracker = null;

async function main() {
  try {
    console.log('🚀 Starting NFT Tracker Bot...');
    console.log('='.repeat(50));
    
    // Load wallets from CSV
    const csvReader = new CSVReader(config.csvFile);
    const wallets = await csvReader.readWallets();
    
    if (wallets.length === 0) {
      console.error('❌ No wallets found in CSV file!');
      process.exit(1);
    }
    
    // Initialize NFT tracker
    nftTracker = new NFTTracker();
    await nftTracker.initialize(wallets);
    
    console.log('\n✅ Bot initialized successfully!');
    console.log(`📊 Tracking ${wallets.length} wallets`);
    console.log(`⏱️  Scan interval: ${config.scanInterval / 1000 / 60} minutes`);
    console.log('🔗 Chains: OpenSea-supported EVM chains');
    console.log('='.repeat(50));
    
    // Start tracking
    await nftTracker.startTracking();
    
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down NFT Tracker Bot...');
  if (nftTracker && nftTracker.discordNotifier) {
    await nftTracker.discordNotifier.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down NFT Tracker Bot...');
  if (nftTracker && nftTracker.discordNotifier) {
    await nftTracker.discordNotifier.disconnect();
  }
  process.exit(0);
});

// Start the bot
main(); 