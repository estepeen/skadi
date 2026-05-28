# NFT Tracker Bot

A bot for tracking NFT transactions across multiple blockchain networks using the OpenSea API V2.

## Features

- 🔍 NFT purchase tracking
- 🔍 NFT sale tracking
- 🔍 NFT mint tracking
- 📊 **Multichain support**: Ethereum, Base, Polygon, Arbitrum, Optimism, BSC, Avalanche, Berachain, Abstract
- 📁 Loading wallets from a CSV file
- ⏱️ Configurable scan interval
- 🤖 Discord notifications with embed messages
- 💰 PnL (profit/loss) calculation for sales

## Supported blockchain networks

### ✅ **Fully supported:**
- **Ethereum** - mainnet
- **Base** - L2 network

### ✅ **Extended support:**
- **Polygon** - L2 network
- **Arbitrum** - L2 network
- **Optimism** - L2 network
- **BSC** - Binance Smart Chain
- **Avalanche** - C-Chain
- **Berachain** - new L1 network
- **Abstract** - new L1 network

### 🔧 **What works on every network:**
- ✅ Transaction tracking via OpenSea API V2
- ✅ NFT metadata via OpenSea API V2
- ✅ Floor prices via OpenSea API V2
- ✅ Crypto prices via CoinGecko
- ✅ Discord notifications with chain emoji
- ✅ Explorer links

## Installation

1. Install the dependencies:
```bash
npm install
```

2. Create a `.env` file with your API keys:
```env
# OpenSea API Key (required)
OPENSEA_API_KEY=your_opensea_api_key_here

# Discord Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
DISCORD_NFTS_ROLE_ID=your_nfts_role_id_here

# Configuration
SCAN_INTERVAL=30000
```

3. Edit the `wallets.csv` file with the wallets to track:
```csv
address,name
0x834711F749fe36dc4A5aE135267b88d0aaaD8F3d,STPN
0x1234567890abcdef1234567890abcdef12345678,Wallet2
```

## Usage

Start the bot:
```bash
npm start
```

For development with automatic restart:
```bash
npm run dev
```

To test Discord notifications:
```bash
node test.js
```

## Project structure

```
nft-tracker/
├── index.js              # Main application file
├── config.js             # Configuration
├── package.json          # Dependencies
├── wallets.csv           # Wallet list
├── test.js               # Discord notification test
├── utils/
│   └── csvReader.js      # CSV file reader
└── services/
    ├── nftTracker.js     # Core tracking logic
    └── discordNotifier.js # Discord notifications
```

## Configuration

- `SCAN_INTERVAL`: Scan interval in milliseconds (default: 30000ms = 30s)
- `OPENSEA_API_KEY`: OpenSea API key for metadata, floor prices and transactions (required)
- `DISCORD_BOT_TOKEN`: Discord bot token
- `DISCORD_CHANNEL_ID`: Channel ID for notifications
- `DISCORD_NFTS_ROLE_ID`: Role ID for NFT notifications (optional)

## Output

The bot will display in the console:
- 🟢 NFT PURCHASED - when a wallet buys an NFT
- 🔴 NFT SOLD - when a wallet sells an NFT
- 🟡 NFT MINTED - when a wallet mints an NFT
- Links to the relevant blockchain explorers for each transaction

**Discord notifications:**
- Embed messages with color coding (green = purchase, red = sale, orange = mint)
- Detailed transaction information including PnL
- Direct links to blockchain explorers
- Floor prices from OpenSea API V2
- Chain emoji for each network

## Discord Setup

1. Create a Discord application at https://discord.com/developers/applications
2. Create a bot for your application
3. Copy the bot token into the `.env` file
4. Add the bot to your server with permissions:
   - Send Messages
   - Embed Links
   - Read Message History
5. Copy the notification channel ID into the `.env` file
6. Optionally set the role ID for NFT notifications

## API Keys

**OpenSea API V2:**
- Get one at https://docs.opensea.io/reference/api-overview
- Used for NFT metadata, floor prices and transactions on all networks
- Required for the bot to work correctly

## Notes

- The bot only tracks new transactions from the moment it starts
- Tracking historical transactions requires modifying the logic
- Rate limiting is implemented to respect API limits
- Discord notifications are optional - the bot works without them
- PnL calculations are based on data from the OpenSea API V2
- Each network has its own explorer and marketplace links
- The bot now uses the OpenSea API V2 exclusively for all operations
