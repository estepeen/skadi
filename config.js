require('dotenv').config();

module.exports = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN,
    channelId: process.env.DISCORD_CHANNEL_ID,
    // Optional role to ping on bulk NFT sweeps (>=3)
    nftsRoleId: process.env.DISCORD_NFTS_ROLE_ID
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  opensea: {
    apiKey: 'REMOVED_ROTATED_KEY'
  },
  scanInterval: 60000, // 1 minute in milliseconds
  csvFile: 'wallets.csv'
}; 