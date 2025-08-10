# 🔴 WETH Bid Support - NFT Tracker Bot

## 📋 **Problém**
Původně bot nepočítal s **WETH bid scénáři**, kde někdo:
1. **Vloží WETH bid** na NFT
2. **Majitel NFT přijme bid** → NFT se prodá za WETH
3. **Bot nepozná** že jde o SELL akci

## ✅ **Řešení**

### 1. **Rozšířené OpenSea API volání**
```javascript
// Původně: pouze sale a mint
event_type=sale&event_type=mint

// Nově: + bid eventy
event_type=sale&event_type=mint&event_type=bid_entered&event_type=bid_accepted
```

### 2. **Detekce bid eventů**
- **`bid_entered`** - někdo vložil WETH bid (jen informace, ne transakce)
- **`bid_accepted`** - majitel přijal WETH bid (SELL akce!)

### 3. **Logika pro bid accepted**
```javascript
if (eventType === 'bid_accepted') {
  // STPN je maker/seller - přijal WETH bid
  if (event.maker.toLowerCase() === walletAddress) {
    isSale = true;
    isBidAccepted = true;
  }
  // STPN je bidder - koupil NFT přes bid
  if (event.bidder.toLowerCase() === walletAddress) {
    isPurchase = true;
  }
}
```

### 4. **WETH/ETH normalizace**
- Bot automaticky převádí `WETH` → `ETH` pro zobrazení
- Cena se správně počítá v USD
- PnL funguje stejně jako u klasických prodejů

## 🧪 **Testování**

### Spustit test bid scénářů:
```bash
node test-bid-scenarios.js
```

### Testuje:
1. **Bid accepted** - wallet přijme WETH bid (SELL)
2. **Bid purchase** - wallet koupí NFT přes bid (BUY)

## 📊 **Discord notifikace**

### Bid accepted (SELL):
```
🔴 WalletName accepted WETH bid for NFT #1234 💰
```

### Popis:
```
WalletName just accepted a WETH bid for NFT #1234 (Collection collection).
```

## 🔧 **Technické detaily**

### OpenSea API v2 eventy:
- **`sale`** - klasický prodej
- **`mint`** - mintování
- **`bid_entered`** - vložení bidu
- **`bid_accepted`** - přijetí bidu

### Payment data:
- Bot se pokouší získat cenu z:
  1. `order_hash` → OpenSea API
  2. `payment` data → event
  3. `bid.amount` → bid data (pro bid_accepted)

### PnL kalkulace:
- Funguje stejně jako u klasických prodejů
- Bot hledá purchase data podle `contractAddress_tokenId`
- Počítá hold time a profit/loss

## 🚀 **Nasazení**

Změny jsou již implementovány v:
- `services/nftTracker.js` - hlavní logika
- `services/discordNotifier.js` - Discord zobrazení
- `test-bid-scenarios.js` - testování

Bot by nyní měl správně detekovat a notifikovat **WETH bid accepted** eventy jako SELL akce! 🎯
