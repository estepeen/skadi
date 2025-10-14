# 🚀 Quick Start: `/ignore` Command

## TL;DR

Farming season? Too many notifications? Use `/ignore` command in Discord!

## Quick Commands

```bash
# Add a collection to ignore list
/ignore add slug:farmingcollection

# Remove from ignore list
/ignore remove slug:farmingcollection

# See what's ignored
/ignore list

# Remove everything
/ignore clear
```

## Example Workflow

### Scenario: Farming Season Started 🌾

You notice a collection is being farmed heavily and spamming Discord:

1. **Find the collection slug** from OpenSea URL
   - Example: `https://opensea.io/collection/farming-nft-2025`
   - Slug = `farming-nft-2025`

2. **Run the command in Discord:**
   ```
   /ignore add slug:farming-nft-2025
   ```

3. **Bot responds immediately:**
   ```
   🚫 Collection Added to Ignore List
   Collection: farming-nft-2025
   Total Ignored: 1 collection
   Note: Transactions will no longer send Discord notifications.
   ```

4. **Done!** No more spam from that collection ✅

### Scenario: Farming Season Ended 🎉

The farming is over, you want notifications again:

1. **Run the remove command:**
   ```
   /ignore remove slug:farming-nft-2025
   ```

2. **Bot responds:**
   ```
   ✅ Collection Removed from Ignore List
   Collection: farming-nft-2025
   Total Ignored: 0 collections
   Note: Transactions will now send Discord notifications.
   ```

3. **Done!** Back to normal ✅

## Features

✅ **Instant** - Changes apply immediately, no bot restart  
✅ **Admin only** - Only admins can modify the list  
✅ **Persistent** - Survives bot restarts  
✅ **Easy** - Just copy the slug from OpenSea  

## Finding Collection Slug

**Method 1: From OpenSea URL**
```
https://opensea.io/collection/bored-ape-yacht-club
                              ^^^^^^^^^^^^^^^^^^^
                              This is the slug
```

**Method 2: From Bot Logs**
Look for collection names in the Discord notifications or bot logs.

## Pro Tips 💡

1. **During airdrop seasons**, use `/ignore add` to silence spam collections
2. **Check regularly** with `/ignore list` to see what's being ignored
3. **Clean up** with `/ignore remove` when farming ends
4. **Emergency clear** with `/ignore clear` if you ignored too many

## Permissions Required

⚠️ You need **Administrator** permission to use `/ignore` commands.

## What Gets Ignored?

When you ignore a collection:
- ❌ No Discord notifications for purchases
- ❌ No Discord notifications for sales
- ❌ No Discord notifications for mints
- ✅ Transactions are still tracked in logs
- ✅ Other collections work normally

## Questions?

See the full documentation in `IGNORE_COMMAND_README.md`

---

**That's it!** Simple, fast, powerful. Happy farming season! 🌾

