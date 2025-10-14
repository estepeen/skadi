# 📱 Discord `/ignore` Command Preview

## How it looks in Discord

### `/ignore add` Command

**User types:**
```
/ignore add slug:farmingcollection
```

**Bot responds with embed:**

```
╔════════════════════════════════════════╗
║  🚫 Collection Added to Ignore List    ║
╠════════════════════════════════════════╣
║                                        ║
║  Successfully added farmingcollection  ║
║  to the ignore list.                   ║
║                                        ║
║  📊 Collection                         ║
║  farmingcollection                     ║
║                                        ║
║  📝 Total Ignored                      ║
║  1 collection                          ║
║                                        ║
║  ⚠️ Note                               ║
║  Transactions from this collection     ║
║  will no longer send Discord           ║
║  notifications.                        ║
║                                        ║
║  🔗 OpenSea                            ║
║  View Collection                       ║
║                                        ║
╚════════════════════════════════════════╝
```

---

### `/ignore list` Command

**User types:**
```
/ignore list
```

**Bot responds with embed:**

```
╔════════════════════════════════════════╗
║  🚫 Ignored Collections                ║
╠════════════════════════════════════════╣
║                                        ║
║  Currently ignoring 3 collections      ║
║                                        ║
║  📋 Collections                        ║
║  1. farmingcollection                  ║
║  2. airdrop-nft                        ║
║  3. spam-collection                    ║
║                                        ║
║  ⚙️ Management                         ║
║  • Use /ignore remove slug:NAME        ║
║    to remove a collection              ║
║  • Use /ignore clear to remove         ║
║    all collections                     ║
║                                        ║
╚════════════════════════════════════════╝
```

---

### `/ignore remove` Command

**User types:**
```
/ignore remove slug:farmingcollection
```

**Bot responds with embed:**

```
╔════════════════════════════════════════╗
║  ✅ Collection Removed from Ignore     ║
║     List                               ║
╠════════════════════════════════════════╣
║                                        ║
║  Successfully removed farmingcollection║
║  from the ignore list.                 ║
║                                        ║
║  📊 Collection                         ║
║  farmingcollection                     ║
║                                        ║
║  📝 Total Ignored                      ║
║  0 collections                         ║
║                                        ║
║  ✅ Note                               ║
║  Transactions from this collection     ║
║  will now send Discord notifications.  ║
║                                        ║
║  🔗 OpenSea                            ║
║  View Collection                       ║
║                                        ║
╚════════════════════════════════════════╝
```

---

### `/ignore clear` Command

**User types:**
```
/ignore clear
```

**Bot responds with embed:**

```
╔════════════════════════════════════════╗
║  🗑️ Ignore List Cleared                ║
╠════════════════════════════════════════╣
║                                        ║
║  Successfully removed 3 collections    ║
║  from the ignore list.                 ║
║                                        ║
║  ✅ Status                             ║
║  All collections cleared               ║
║                                        ║
║  📝 Total Ignored                      ║
║  0 collections                         ║
║                                        ║
║  ⚠️ Note                               ║
║  All collections will now send         ║
║  Discord notifications.                ║
║                                        ║
╚════════════════════════════════════════╝
```

---

## Color Scheme

- **Add** (Red): `#FF6B6B` - Warning color for adding to ignore
- **Remove** (Green): `#51CF66` - Success color for removing
- **List** (Red): `#FF6B6B` - Info color for listing
- **Clear** (Orange): `#FFA94D` - Caution color for clearing all

## Message Visibility

All `/ignore` command responses are **ephemeral** (only visible to the user who ran the command), keeping the channel clean!

---

**Note:** These are text representations. Actual Discord embeds will have:
- Rich formatting
- Clickable links
- Color-coded borders
- Proper emoji rendering
