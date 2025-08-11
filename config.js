require('dotenv').config();

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
  csvFile: "wallets.csv"
}; 