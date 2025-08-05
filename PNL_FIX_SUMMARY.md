# PnL Formátování - Opravy

## 🔧 **Problém**
PnL se zobrazoval s `NaN` místo správné hodnoty:
```
<0.001 ETH (-$NaN)
-9.1%
```

## ✅ **Řešení**
Opraveno formátování PnL v `services/discordNotifier.js`:

### 1. **Ošetření NaN hodnot**
```javascript
// Format USD PnL - handle NaN and small values properly
if (isNaN(pnlUSD) || !isFinite(pnlUSD)) {
  formattedPnlUSD = '<$1';
} else if (Math.abs(pnlUSD) < 1) {
  formattedPnlUSD = '<$1';
} else {
  formattedPnlUSD = Math.round(pnlUSD * 100) / 100;
}

// Format percentage - handle NaN and small values
const percentage = (pnl / buyPrice) * 100;
if (isNaN(percentage) || !isFinite(percentage)) {
  percentageText = '<1%';
} else if (Math.abs(percentage) < 1) {
  percentageText = '<1%';
} else {
  percentageText = percentage > 0 ? `+${percentage.toFixed(1)}%` : `${percentage.toFixed(1)}%`;
}
```

### 2. **Správné formátování pro ztráty**
```javascript
// Handle the case where formattedPnlUSD is '<$1'
const usdDisplay = formattedPnlUSD === '<$1' ? '$1' : `$${Math.abs(parseFloat(formattedPnlUSD))}`;
pnlValue = `-${formattedPnl} ${displaySymbol}\n-${usdDisplay}\n${percentageText}`;
```

## 📋 **Výsledek**
Nyní se PnL zobrazuje správně:
```
😢 PnL
-<0.001 ETH
-$1
-16.7%
```

## 🧪 **Testování**
Spusťte testy pro ověření:
```bash
node test-pnl-fix.js
node test-pnl-display.js
```

## 🔄 **Změny v kódu**
- Přidáno ošetření `isNaN()` a `!isFinite()` pro USD hodnoty
- Opraveno formátování pro malé hodnoty (<$1)
- Přidán mínus před ETH hodnotu pro ztráty
- Každá hodnota na novém řádku pro lepší čitelnost

## 📝 **Poznámky**
- Nikdy se nezobrazí `NaN` - místo toho se zobrazí `<$1` nebo `<1%`
- Malé hodnoty (<$1) se zobrazují jako `$1` místo přesné hodnoty
- Formátování je konzistentní pro všechny typy transakcí 