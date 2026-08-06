const CSVReader = require('./utils/csvReader');
const NFTTracker = require('./services/nftTracker');
const config = require('./config');
const registry = require('./services/registry');

let nftTracker = null;

// Export function to get NFTTracker instance for other modules
function getNFTTracker() {
  return registry.getNFTTracker();
}

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
    registry.setNFTTracker(nftTracker);
    // The notifier instance exists from the constructor. Register it now so
    // slash commands fired while Discord is still connecting can reach it.
    registry.setDiscordNotifier(nftTracker.discordNotifier);
    await nftTracker.initialize(wallets);

    // initialize() sets discordNotifier to null on Discord failure, so register
    // whatever the value is once initialization has completed
    registry.setDiscordNotifier(nftTracker.discordNotifier);

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

// Export the getter functions
module.exports = {
  getNFTTracker,
  getDiscordNotifier
};

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

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Export function to get discord notifier
function getDiscordNotifier() {
  return registry.getDiscordNotifier();
}

// Start the bot only when run directly, so requiring this module does not
// boot a second tracker and a second Discord login
if (require.main === module) {
  main();
}
