# 🚫 Ignored Collections Feature

## Overview
This feature allows you to blacklist specific NFT collections from sending Discord notifications. This is useful during farming seasons when certain collections have hundreds of transactions per day.

## How to Use

### 1. Edit the Ignore List
Open `ignored-collections.txt` and add collection slugs (one per line):

```txt
# 🚫 Ignored NFT Collections
# Add collection slugs here (one per line)
# Lines starting with # are comments

farmingcollection
airdrop-nft
spam-collection
```

### 2. Find Collection Slug
To find a collection's slug:
- Go to OpenSea: `https://opensea.io/collection/SLUG`
- The slug is the last part of the URL
- Example: For `https://opensea.io/collection/bored-ape-yacht-club`, the slug is `bored-ape-yacht-club`

### 3. Restart the Bot
After editing `ignored-collections.txt`, restart the bot:

```bash
pm2 restart skadi-nft-tracker
```

Or if running locally:
```bash
npm start
```

## Features

✅ **Simple text file** - No code changes needed  
✅ **Comments supported** - Lines starting with `#` are ignored  
✅ **Case insensitive** - Slugs are automatically converted to lowercase  
✅ **Hot reload ready** - Just edit the file and restart the bot  
✅ **No Discord spam** - Transactions are logged but not sent to Discord  

## Example

```txt
# Farming collections that spam Discord
farmingcollection
daily-airdrop-nft

# Spam collections
spam-collection-2025
test-collection
```

## How It Works

1. Bot loads `ignored-collections.txt` on startup
2. When processing NFT transactions, it checks if the collection slug is in the ignore list
3. If matched, the transaction is logged but **no Discord notification is sent**
4. Other wallets and collections continue to work normally

## Logs

When a transaction is ignored, you'll see in the logs:
```
🚫 Skipping ignored collection: farmingcollection
```

When the bot starts, it will show:
```
🚫 Loaded 3 ignored collection(s): [ 'farmingcollection', 'airdrop-nft', 'spam-collection' ]
```

## Notes

- Empty lines are ignored
- Comments (lines starting with `#`) are ignored
- Slugs are automatically converted to lowercase for matching
- If the file doesn't exist, the bot will create it with examples
- Transactions are still tracked, just not sent to Discord

---

**Questions?** Check the main README.md or contact support.

