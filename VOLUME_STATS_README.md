# Volume and Stats Enhancement

This enhancement adds comprehensive volume and statistics tracking to the NFT tracker, providing detailed market insights for each collection.

## 🆕 New Features

### 📊 Enhanced Collection Stats
The tracker now fetches and displays comprehensive collection statistics including:

- **Floor Price**: Current floor price of the collection
- **Total Volume**: All-time trading volume
- **Total Sales**: Number of sales transactions
- **Number of Owners**: Unique wallet holders
- **Average Price**: Average sale price
- **Market Cap**: Total market capitalization

### 📈 Volume Data (24h, 7d, 30d)
- **24h Volume**: Trading volume in the last 24 hours
- **7d Volume**: Trading volume in the last 7 days
- **30d Volume**: Trading volume in the last 30 days

### 📊 Volume Changes
- **24h Volume Change**: Percentage change in volume over 24 hours
- **7d Volume Change**: Percentage change in volume over 7 days
- **30d Volume Change**: Percentage change in volume over 30 days

### 📈 Volume Diffs
- **24h Volume Diff**: Absolute volume difference over 24 hours
- **7d Volume Diff**: Absolute volume difference over 7 days
- **30d Volume Diff**: Absolute volume difference over 30 days

## 🔧 Implementation Details

### OpenSea API v2 Integration
The enhancement uses OpenSea API v2's `/collections/{slug}/stats` endpoint to fetch comprehensive collection statistics:

```javascript
const response = await fetch(`https://api.opensea.io/api/v2/collections/${slug}/stats?chain=${chain}`, {
  headers: {
    'X-API-KEY': apiKey,
    'Accept': 'application/json'
  }
});
```

### API Response Structure
The OpenSea API v2 returns data in this structure:

```json
{
  "total": {
    "volume": 0,
    "sales": 0,
    "average_price": 0,
    "num_owners": 0,
    "market_cap": 0,
    "floor_price": 0,
    "floor_price_symbol": "string"
  },
  "intervals": [
    {
      "interval": "one_day",
      "volume": 0,
      "volume_diff": 0,
      "volume_change": 0,
      "sales": 0,
      "sales_diff": 0,
      "average_price": 0
    }
  ]
}
```

### Discord Notification Enhancement
Discord notifications now include:

1. **Floor Price**: Current floor price of the collection
2. **Volume Data**: 24h, 7d, and 30d volume with smart formatting (K/M for thousands/millions)
3. **Volume Changes**: Percentage changes in volume over different time periods

Example Discord notification fields:
```
🎯 Floor price: 0.0016 ETH
📊 Volume: 24h: $1.2K
           7d: $8.5K
           30d: $45.2K
📈 Volume Change: 24h: +15.3%
                 7d: -5.2%
                 30d: +25.1%
```

## 🧪 Testing

### Test Scripts
Two test scripts are provided to verify the functionality:

1. **`test-volume-stats.js`**: Tests the basic volume and stats functionality
2. **`test-enhanced-volume-notifications.js`**: Tests how the data appears in Discord notifications

### Running Tests
```bash
# Test basic volume and stats functionality
node test-volume-stats.js

# Test enhanced Discord notifications
node test-enhanced-volume-notifications.js
```

## 🔄 Usage

### Getting Collection Stats
```javascript
const nftTracker = new NFTTracker();
const stats = await nftTracker.getCollectionStats(contractAddress, chainName);

if (stats) {
  console.log(`Floor Price: ${stats.floor_price} ETH`);
  console.log(`24h Volume: ${stats.one_day_volume} ETH`);
  console.log(`24h Volume Change: ${(stats.one_day_volume_change * 100).toFixed(1)}%`);
}
```

### Available Stats Properties
- `floor_price`: Current floor price
- `total_volume`: All-time volume
- `total_sales`: Total number of sales
- `num_owners`: Number of unique owners
- `average_price`: Average sale price
- `market_cap`: Market capitalization
- `one_day_volume`: 24h volume
- `seven_day_volume`: 7d volume
- `thirty_day_volume`: 30d volume
- `one_day_volume_change`: 24h volume change (percentage)
- `seven_day_volume_change`: 7d volume change (percentage)
- `thirty_day_volume_change`: 30d volume change (percentage)
- `one_day_volume_diff`: 24h volume difference (absolute)
- `seven_day_volume_diff`: 7d volume difference (absolute)
- `thirty_day_volume_diff`: 30d volume difference (absolute)

## 🚀 Future Enhancements

### Floor Price Change Tracking
Currently, the system shows volume changes as a proxy for price changes. Future enhancements could include:

1. **Historical Floor Price Database**: Store floor prices over time
2. **Real Floor Price Changes**: Calculate actual floor price percentage changes
3. **Price Trend Analysis**: Identify bullish/bearish trends

### Additional Metrics
Potential additions:
- **Rarity Distribution**: Track rare trait sales
- **Whale Activity**: Monitor large transactions
- **Market Sentiment**: Analyze buy/sell ratios
- **Liquidity Metrics**: Track bid/ask spreads

## 🔧 Configuration

No additional configuration is required. The enhancement uses the existing OpenSea API key from `config.js`.

## 📝 Notes

- Volume changes are currently displayed as a proxy for price changes since OpenSea API v2 doesn't directly provide floor price change data
- The system gracefully handles missing data and displays "N/A" when information is unavailable
- Rate limiting is implemented to avoid API restrictions
- All volume data is converted to USD for consistent display across different chains 