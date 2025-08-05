# PnL (Profit and Loss) Opravy

Tento dokument popisuje opravy provedené na PnL (Profit and Loss) výpočtech v NFT trackeru.

## 🔧 Problémy, které byly opraveny

### 1. Nekonzistentní data mezi nftTracker a discordNotifier
**Problém**: `nftTracker.js` ukládal PnL data jako `pnl` a `pnlPercent`, ale `discordNotifier.js` očekával `buyPrice` a `price`.

**Řešení**: Přidáno ukládání `buyPrice`, `buyPriceUSD` a `buyTimestamp` do `transactionData` pro konzistentní předávání dat.

### 2. Chybějící procentuální zobrazení PnL
**Problém**: PnL se zobrazoval pouze jako absolutní hodnota bez procentuálního vyjádření.

**Řešení**: Přidáno procentuální zobrazení do Discord notifikací:
```
🤑 PnL: +0.0004 ETH
        (+$1.20)
        +25.0%
```

### 3. Nekonzistentní hold time výpočet
**Problém**: Hold time se počítal různě v `nftTracker.js` a `discordNotifier.js`.

**Řešení**: Sjednocen výpočet hold time s lepším formátováním:
- `<1 hour` pro méně než 1 hodinu
- `X hours` pro méně než 24 hodin
- `Xd Yh` pro dny a hodiny
- `X days` pro celé dny

### 4. Timestamp konzistence
**Problém**: Timestampy se ukládaly jako Date objekty, ale očekávaly se jako numbers.

**Řešení**: Všechny timestampy se nyní ukládají jako milliseconds pro konzistenci.

## 📊 Jak PnL funguje

### Ukládání nákupních dat
```javascript
// Při nákupu NFT se uloží:
this.nftPurchases.set(purchaseKey, {
  price: price,           // Nákupní cena v ETH
  priceUSD: priceUSD,     // Nákupní cena v USD
  timestamp: timestamp,   // Čas nákupu v milliseconds
  walletAddress: walletInfo.address
});
```

### Výpočet PnL při prodeji
```javascript
// Při prodeji NFT se vypočítá:
const pnl = price - purchaseData.price;                    // Absolutní PnL
const pnlPercent = ((pnl / purchaseData.price) * 100).toFixed(2); // Procentuální PnL

// Uloží se do transactionData:
transactionData.pnl = pnl;
transactionData.pnlPercent = pnlPercent;
transactionData.buyPrice = purchaseData.price;
transactionData.buyPriceUSD = purchaseData.priceUSD;
transactionData.buyTimestamp = purchaseData.timestamp;
```

### Zobrazení v Discord
```javascript
// PnL se zobrazí jako:
if (pnl > 0) {
  pnlValue = `+${formattedPnl} ${tokenSymbol}\n(+$${formattedPnlUSD})\n${percentageText}`;
  pnlEmoji = '🤑'; // Profit
} else if (pnl < 0) {
  pnlValue = `${formattedPnl} ${tokenSymbol}\n(-$${Math.abs(formattedPnlUSD)})\n${percentageText}`;
  pnlEmoji = '😢'; // Loss
}
```

## 🧪 Testování

### Test Script
Spusťte `test-pnl-fix.js` pro ověření PnL funkcionality:

```bash
node test-pnl-fix.js
```

### Testovací scénáře
1. **Nákup NFT** - uloží se nákupní data
2. **Prodej s profit** - zobrazí se pozitivní PnL
3. **Prodej se ztrátou** - zobrazí se negativní PnL
4. **Discord notifikace** - ověří se správné zobrazení

### Příklad výstupu
```
📥 Test 1: Simulating a purchase...
✅ Purchase processed
📊 Stored purchases: 1

📤 Test 2: Simulating a sale with profit...
✅ Sale processed
📊 Remaining purchases: 0

📋 PnL Notification Preview:
==================================================
Title: 🟢 TestWallet bought Test NFT #1
Fields:
1. 💰 Price: 0.002 ETH
2. 📦 Qty: 1 NFT
3. 💼 In total: 0.002 ETH
4. 🤑 PnL: +0.0004 ETH
           (+$1.20)
           +25.0%
5. 🕐 Hodl time: 1d 0h
6. 🔗 Chain: Base
```

## 🔄 Klíčové změny v kódu

### services/nftTracker.js
- Přidáno ukládání `buyPrice`, `buyPriceUSD`, `buyTimestamp` do `transactionData`
- Opraven timestamp formát pro konzistenci
- Vylepšen hold time výpočet

### services/discordNotifier.js
- Přidáno procentuální zobrazení PnL
- Opraven hold time formátování
- Vylepšeno zobrazení PnL s emoji

## 📝 Poznámky

- PnL se počítá pouze pro prodeje, kde máme uložená nákupní data
- Pokud nákupní data nejsou k dispozici, zobrazí se "-" v PnL poli
- Hold time se zobrazuje pouze pro prodeje
- Všechny ceny se zobrazují v původní měně (ETH, BASE, atd.) i v USD
- Procentuální PnL se zobrazuje s jedním desetinným místem 