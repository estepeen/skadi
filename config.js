require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
    channelId: process.env.DISCORD_CHANNEL_ID,
    nftsRoleId: process.env.DISCORD_NFTS_ROLE_ID
  },
  opensea: {
    apiKey: process.env.OPENSEA_API_KEY || "REMOVED_ROTATED_KEY"
  },
  scanInterval: process.env.SCAN_INTERVAL ? parseInt(process.env.SCAN_INTERVAL) : 60000,
  csvFile: "wallets.csv",
  
  // 🚫 Load ignored collections from external file
  ignoredCollections: loadIgnoredCollections()
}; 