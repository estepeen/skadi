require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Not fatal any more: utils/openseaKey.js falls back to a cached or freshly
// minted free key when the operator has no key of their own.
if (!process.env.OPENSEA_API_KEY) {
  console.log('⚠️ OPENSEA_API_KEY is not set - a free OpenSea key will be resolved automatically.');
}

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN is not set. Add it to your .env file.');
  process.exit(1);
}

if (!process.env.DISCORD_CHANNEL_ID) {
  console.error('❌ DISCORD_CHANNEL_ID is not set. Add it to your .env file.');
  process.exit(1);
}

/**
 * Load ignored collections from external file
 * @returns {Array<string>} Array of ignored collection slugs (lowercase)
 */
function loadIgnoredCollections() {
  try {
    const filePath = path.join(__dirname, 'ignored-collections.txt');
    
    if (!fs.existsSync(filePath)) {
      console.log('ℹ️ No ignored-collections.txt file found');
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const collections = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')) // Skip empty lines and comments
      .map(slug => slug.toLowerCase()); // Convert to lowercase for matching
    
    if (collections.length > 0) {
      console.log(`🚫 Loaded ${collections.length} ignored collection(s):`, collections);
    }
    
    return collections;
  } catch (error) {
    console.error('❌ Error loading ignored collections:', error.message);
    return [];
  }
}

module.exports = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN,
    // DISCORD_CHANNEL_ID accepts a comma-separated list so the same feed can
    // reach several servers. channelId stays as the first entry for the code
    // paths that only ever needed one.
    channelId: String(process.env.DISCORD_CHANNEL_ID || '').split(',')[0].trim(),
    channelIds: String(process.env.DISCORD_CHANNEL_ID || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
    nftsRoleId: process.env.DISCORD_NFTS_ROLE_ID,
    // Minimum sweep size that pings the NFTs role. 0 disables the ping
    // entirely - notifications still post, they just do not ring anyone.
    // At the old hardcoded threshold of 3 this fired 15 times in one day.
    rolePingMinItems: process.env.NFT_ROLE_PING_MIN_ITEMS
      ? parseInt(process.env.NFT_ROLE_PING_MIN_ITEMS)
      : 0
  },
  opensea: {
    apiKey: process.env.OPENSEA_API_KEY
  },
  scanInterval: process.env.SCAN_INTERVAL ? parseInt(process.env.SCAN_INTERVAL) : 60000,

  // Gap between per-wallet requests inside one sweep. The free OpenSea tier is
  // 600 requests/hour, but it is enforced as a short window - so N wallets fired
  // back to back trip a 429 even when the hourly average is well under budget.
  // Keep this at roughly 60 / (requests-per-minute you are allowed).
  walletScanDelay: process.env.WALLET_SCAN_DELAY ? parseInt(process.env.WALLET_SCAN_DELAY) : 7000,
  csvFile: "wallets.csv",
  
  // 🚫 Load ignored collections from external file
  ignoredCollections: loadIgnoredCollections()
}; 