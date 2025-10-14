# 🔧 Ignore Command Fix - Hot Reload

## ❌ **Problém:**
`/ignore` command přidal kolekci do blacklistu, ale bot stále posílal notifikace z `dxterminal` kolekce.

## 🔍 **Příčina:**
**NFTTracker načítal config pouze při startu** - když `/ignore` command změnil `ignored-collections.txt`, NFTTracker stále používal starý config z paměti.

## ✅ **Řešení:**

### **1. Přidána `reloadConfig()` metoda do NFTTracker**
```javascript
reloadConfig() {
  // Clear require cache for config
  const configPath = require.resolve('../config');
  delete require.cache[configPath];
  
  // Reload config
  this.config = require('../config');
  
  console.log('🔄 NFT Tracker: Config reloaded with updated ignore list');
}
```

### **2. Přidán getter pro NFTTracker instance v `index.js`**
```javascript
function getNFTTracker() {
  return nftTracker;
}

module.exports = {
  getNFTTracker,
  getDiscordNotifier
};
```

### **3. Upraven `ignoreCommand.js` aby volal reload**
```javascript
reloadConfig() {
  // Reload main config
  const config = require('../config');
  
  // Also reload NFTTracker config
  const { getNFTTracker } = require('../index');
  const nftTracker = getNFTTracker();
  if (nftTracker && nftTracker.reloadConfig) {
    nftTracker.reloadConfig();
    console.log('✅ NFTTracker config reloaded successfully');
  }
}
```

### **4. Přidáno debug logování**
```javascript
// DEBUG: Log collection info for debugging
console.log(`🔍 DEBUG: Collection slug: "${collectionSlug}"`);
console.log(`🔍 DEBUG: Ignored collections: [${(this.config.ignoredCollections || []).join(', ')}]`);
```

---

## 🚀 **Jak to teď funguje:**

### **Před opravou:**
1. ✅ `/ignore add slug:dxterminal` - uloží do souboru
2. ❌ NFTTracker používá starý config z paměti
3. ❌ Transakce z `dxterminal` se stále posílají na Discord

### **Po opravě:**
1. ✅ `/ignore add slug:dxterminal` - uloží do souboru
2. ✅ `ignoreCommand.reloadConfig()` - reloaduje config
3. ✅ `nftTracker.reloadConfig()` - reloaduje NFTTracker config
4. ✅ Transakce z `dxterminal` se **NEPOSÍLAJÍ** na Discord

---

## 📋 **Soubory k nahrání na server:**

```
services/nftTracker.js          (s reload funkcí)
services/nftTracker.min.js      (minifikovaná verze)
services/ignoreCommand.js       (s NFTTracker reload)
services/ignoreCommand.min.js   (minifikovaná verze)
index.js                        (s getNFTTracker exportem)
index.min.js                    (minifikovaná verze)
```

---

## 🧪 **Jak otestovat:**

### **1. Nahraj soubory a restart bot:**
```bash
pm2 restart skadi-nft-tracker
```

### **2. Zkontroluj start logy:**
```bash
pm2 logs skadi-nft-tracker --lines 20
```

**Měl bys vidět:**
```
🚫 NFT Tracker: 1 ignored collections loaded: [ 'dxterminal' ]
```

### **3. Přidej kolekci přes Discord:**
```
/ignore add slug:test-collection
```

**Měl bys vidět v logách:**
```
🔄 Config reloaded with updated ignore list
✅ NFTTracker config reloaded successfully
🚫 NFT Tracker: 2 ignored collections: [ 'dxterminal', 'test-collection' ]
```

### **4. Zkontroluj debug při transakci:**
```bash
pm2 logs skadi-nft-tracker --lines 50 | grep DEBUG
```

**Měl bys vidět:**
```
🔍 DEBUG: Collection slug: "dxterminal"
🔍 DEBUG: Ignored collections: [ 'dxterminal', 'test-collection' ]
🚫 Skipping ignored collection: dxterminal
```

---

## 🎯 **Očekávaný výsledek:**

✅ **`/ignore` command funguje okamžitě**  
✅ **Žádné restart bota není potřeba**  
✅ **Transakce z ignorovaných kolekcí se neposílají na Discord**  
✅ **Debug logy ukazují co se děje**  
✅ **Config se reloaduje automaticky**  

---

## 🚨 **Pokud to stále nefunguje:**

### **Zkontroluj:**
1. **Start logy** - vidíš `🚫 NFT Tracker: X ignored collections loaded`?
2. **Ignore command logy** - vidíš `✅ NFTTracker config reloaded successfully`?
3. **Debug logy** - vidíš správný collection slug a ignore list?

### **Možné problémy:**
- **Config se nenačetl při startu** → restart bot
- **Collection slug neodpovídá** → zkontroluj debug logy
- **Ignore command nefunguje** → zkontroluj permissions

---

**🎉 Po nahrání těchto souborů by `/ignore` command měl fungovat okamžitě bez restartu!**
