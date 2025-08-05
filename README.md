# NFT Tracker Bot

Bot pro sledování NFT transakcí na více blockchain sítích pomocí OpenSea API a Etherscan.

## Funkce

- 🔍 Sledování nákupů NFT
- 🔍 Sledování prodejů NFT  
- 🔍 Sledování mintování NFT
- 📊 **Multichain podpora**: Ethereum, Base, Polygon, Arbitrum, Optimism, BSC, Avalanche, Berachain, Abstract
- 📁 Načítání peněženek z CSV souboru
- ⏱️ Konfigurovatelný interval skenování
- 🤖 Discord notifikace s embed zprávami
- 💰 Výpočet PnL (profit/loss) pro prodeje

## Podporované blockchain sítě

### ✅ **Plně podporované:**
- **Ethereum** - hlavní síť
- **Base** - L2 síť

### ✅ **Rozšířená podpora:**
- **Polygon** - L2 síť
- **Arbitrum** - L2 síť  
- **Optimism** - L2 síť
- **BSC** - Binance Smart Chain
- **Avalanche** - C-Chain
- **Berachain** - nová L1 síť
- **Abstract** - nová L1 síť

### 🔧 **Co funguje na každé síti:**
- ✅ Sledování transakcí přes Etherscan API
- ✅ NFT metadata přes OpenSea API
- ✅ Floor prices přes OpenSea API
- ✅ Ceny kryptoměn přes CoinGecko
- ✅ Discord notifikace s chain emoji
- ✅ Explorer odkazy

## Instalace

1. Nainstalujte závislosti:
```bash
npm install
```

2. Vytvořte `.env` soubor s vašimi API klíči:
```env
# OpenSea API Key
OPENSEA_API_KEY=your_opensea_api_key_here

# Etherscan API Key (volitelné, free tier)
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Discord Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here

# Configuration
SCAN_INTERVAL=30000
```

3. Upravte `wallets.csv` soubor s peněženkami ke sledování:
```csv
address,name
0x834711F749fe36dc4A5aE135267b88d0aaaD8F3d,STPN
0x1234567890abcdef1234567890abcdef12345678,Wallet2
```

## Použití

Spusťte bot:
```bash
npm start
```

Pro vývoj s automatickým restartem:
```bash
npm run dev
```

Pro testování Discord notifikací:
```bash
node test.js
```

## Struktura projektu

```
nft-tracker/
├── index.js              # Hlavní soubor aplikace
├── config.js             # Konfigurace
├── package.json          # Závislosti
├── wallets.csv           # Seznam peněženek
├── test.js               # Test Discord notifikací
├── utils/
│   └── csvReader.js      # Čtení CSV souboru
└── services/
    ├── nftTracker.js     # Hlavní logika sledování
    └── discordNotifier.js # Discord notifikace
```

## Konfigurace

- `SCAN_INTERVAL`: Interval skenování v milisekundách (výchozí: 30000ms = 30s)
- `OPENSEA_API_KEY`: OpenSea API klíč pro metadata a floor prices
- `ETHERSCAN_API_KEY`: Etherscan API klíč pro transakce (volitelné)
- `DISCORD_BOT_TOKEN`: Discord bot token
- `DISCORD_CHANNEL_ID`: ID kanálu pro notifikace

## Výstup

Bot bude v konzoli zobrazovat:
- 🟢 NFT PURCHASED - když peněženka koupí NFT
- 🔴 NFT SOLD - když peněženka prodá NFT
- 🟡 NFT MINTED - když peněženka mintuje NFT
- Odkazy na příslušné blockchain explorery pro každou transakci

**Discord notifikace:**
- Embed zprávy s barevným kódováním (zelená = nákup, červená = prodej, oranžová = mint)
- Detailní informace o transakci včetně PnL
- Přímé odkazy na blockchain explorery
- Floor prices z OpenSea API
- Chain emoji pro každou síť

## Discord Setup

1. Vytvořte Discord aplikaci na https://discord.com/developers/applications
2. Vytvořte bot pro vaši aplikaci
3. Zkopírujte bot token do `.env` souboru
4. Přidejte bot do vašeho serveru s oprávněními:
   - Send Messages
   - Embed Links
   - Read Message History
5. Zkopírujte ID kanálu pro notifikace do `.env` souboru

## API Klíče

**OpenSea API:**
- Získejte na https://docs.opensea.io/reference/api-overview
- Používá se pro metadata NFT a floor prices na všech sítích

**Etherscan API:**
- Získejte na https://etherscan.io/apis
- Volitelné, free tier je dostatečné
- Používá se pro získání transakcí na všech podporovaných sítích

## Poznámky

- Bot sleduje pouze nové transakce od spuštění
- Pro sledování historických transakcí je potřeba upravit logiku
- Rate limiting je implementován pro respektování API limitů
- Discord notifikace jsou volitelné - bot funguje i bez nich
- PnL výpočty jsou založeny na uložených nákupních datech
- Každá síť má vlastní explorer a marketplace odkazy 