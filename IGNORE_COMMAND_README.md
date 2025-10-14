# 🚫 `/ignore` Discord Command

## Overview
Manage the NFT collection blacklist directly from Discord! Perfect for quickly adding/removing farming collections during airdrop seasons.

## Features

✅ **Add collections** - Instantly blacklist a collection  
✅ **Remove collections** - Remove from blacklist when farming ends  
✅ **List all** - See all currently ignored collections  
✅ **Clear all** - Remove all collections at once  
✅ **Admin only** - Only server administrators can use this command  
✅ **Auto-reload** - Changes apply immediately without restarting the bot  

## Commands

### `/ignore add`
Add a collection to the ignore list.

**Usage:**
```
/ignore add slug:collection-name
```

**Example:**
```
/ignore add slug:farmingcollection
/ignore add slug:daily-airdrop-nft
```

**What it does:**
- Adds the collection to `ignored-collections.txt`
- Reloads the config automatically
- Shows confirmation embed with collection details
- Future transactions from this collection won't send Discord notifications

---

### `/ignore remove`
Remove a collection from the ignore list.

**Usage:**
```
/ignore remove slug:collection-name
```

**Example:**
```
/ignore remove slug:farmingcollection
```

**What it does:**
- Removes the collection from `ignored-collections.txt`
- Reloads the config automatically
- Shows confirmation embed
- Transactions from this collection will now send notifications again

---

### `/ignore list`
Show all currently ignored collections.

**Usage:**
```
/ignore list
```

**What it shows:**
- Total number of ignored collections
- List of all collection slugs with OpenSea links
- Management options

---

### `/ignore clear`
Remove ALL collections from the ignore list.

**Usage:**
```
/ignore clear
```

**What it does:**
- Clears the entire ignore list
- Reloads the config automatically
- Shows confirmation with count of removed collections
- ⚠️ Use with caution! This removes ALL ignored collections

---

## Permissions

**Required:** `Administrator` permission on Discord server

Only users with administrator permissions can use `/ignore` commands. This prevents regular users from modifying the blacklist.

## How to Find Collection Slug

1. Go to the collection on OpenSea
2. Look at the URL: `https://opensea.io/collection/SLUG`
3. The slug is the last part of the URL

**Examples:**
- `https://opensea.io/collection/bored-ape-yacht-club` → slug is `bored-ape-yacht-club`
- `https://opensea.io/collection/pudgypenguins` → slug is `pudgypenguins`
- `https://opensea.io/collection/azuki` → slug is `azuki`

## Examples

### During Farming Season
```bash
# User notices spam from farming collection
/ignore add slug:farming-collection-2025

# Bot responds:
✅ Collection Added to Ignore List
Collection: farming-collection-2025
Total Ignored: 1 collection
Note: Transactions from this collection will no longer send Discord notifications.
```

### After Farming Ends
```bash
# Farming season is over
/ignore remove slug:farming-collection-2025

# Bot responds:
✅ Collection Removed from Ignore List
Collection: farming-collection-2025
Total Ignored: 0 collections
Note: Transactions from this collection will now send Discord notifications.
```

### Check What's Ignored
```bash
/ignore list

# Bot responds:
🚫 Ignored Collections
Currently ignoring 3 collections

📋 Collections:
1. farming-collection-2025
2. daily-airdrop-nft
3. spam-collection

⚙️ Management:
• Use /ignore remove slug:NAME to remove a collection
• Use /ignore clear to remove all collections
```

## File Synchronization

The `/ignore` command directly modifies `ignored-collections.txt`:

**Before:**
```txt
# 🚫 Ignored NFT Collections
# Managed via Discord /ignore command

```

**After `/ignore add slug:test`:**
```txt
# 🚫 Ignored NFT Collections
# Managed via Discord /ignore command

test
```

## Auto-Reload

When you use `/ignore add` or `/ignore remove`, the bot automatically:

1. ✅ Updates `ignored-collections.txt`
2. ✅ Clears Node.js require cache for `config.js`
3. ✅ Reloads the config with new ignore list
4. ✅ Applies changes immediately (no restart needed!)

You'll see in the logs:
```
🔄 Config reloaded with updated ignore list
📋 Current ignored collections: [ 'test-collection' ]
```

## Validation

The command validates collection slugs:

✅ **Valid:**
- `bored-ape-yacht-club`
- `azuki`
- `pudgypenguins`

❌ **Invalid:**
- `bored ape yacht club` (contains spaces)
- `#collection` (contains #)
- `` (empty string)

## Troubleshooting

### Command not showing up?
- Check if you have Administrator permissions
- Try `/help` to see all available commands
- Restart Discord client

### Changes not applying?
- The bot auto-reloads config
- Check bot logs for reload confirmation
- If issues persist, restart the bot manually

### Collection still sending notifications?
- Verify the slug is correct
- Check `/ignore list` to confirm it's in the list
- Collection slug must match exactly (case-insensitive)

## Integration with Manual Editing

You can still manually edit `ignored-collections.txt`:

1. Edit the file directly
2. Add/remove slugs
3. **Restart the bot** (manual edits require restart)

Or use `/ignore` commands (no restart needed).

---

**Pro Tip:** Use `/ignore add` during farming seasons to quickly silence spam collections, then `/ignore remove` when the farming ends! 🎯

