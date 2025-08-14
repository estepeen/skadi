const fetch = require('node-fetch');

class CryptoPriceService {
  constructor() {
    this.prices = {};
    this.currentIndex = 0;
    this.cryptos = [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
      { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
      { id: 'solana', symbol: 'SOL', name: 'Solana' }
    ];
    this.updateInterval = null;
    this.rotationInterval = null;
  }

  async fetchPrices() {
    try {
      const cryptoIds = this.cryptos.map(crypto => crypto.id).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds}&vs_currencies=usd&include_24hr_change=true`;
      
      console.log(`🔍 Fetching crypto prices from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Skadi-NFT-Tracker/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Update our prices cache
      this.cryptos.forEach(crypto => {
        if (data[crypto.id]) {
          this.prices[crypto.symbol] = {
            symbol: crypto.symbol,
            name: crypto.name,
            price: data[crypto.id].usd,
            change24h: data[crypto.id].usd_24h_change || 0
          };
        }
      });

      console.log('📊 Updated crypto prices:', Object.keys(this.prices).map(symbol => 
        `${symbol}: $${this.prices[symbol].price.toLocaleString()}`
      ).join(', '));

      return this.prices;
    } catch (error) {
      console.error('❌ Error fetching crypto prices:', error.message);
      return this.prices; // Return cached prices on error
    }
  }

  getCurrentPrice() {
    const crypto = this.cryptos[this.currentIndex];
    const priceData = this.prices[crypto.symbol];
    
    if (!priceData) {
      return `${crypto.symbol}: Loading...`;
    }

    const changePercent = Math.abs(priceData.change24h).toFixed(1);
    const changeSign = priceData.change24h >= 0 ? '+' : '-';
    const priceFormatted = Math.round(priceData.price).toLocaleString();
    
    return `${crypto.symbol}: $${priceFormatted} (${changeSign}${changePercent}%)`;
  }

  rotateCrypto() {
    this.currentIndex = (this.currentIndex + 1) % this.cryptos.length;
    console.log(`🔄 Rotated to: ${this.cryptos[this.currentIndex].symbol}`);
  }

  startService(discordClient) {
    console.log('🚀 Starting Crypto Price Service...');
    
    // Initial fetch
    this.fetchPrices().then(() => {
      this.updatePresence(discordClient);
    });

    // Update prices every 5 minutes
    this.updateInterval = setInterval(async () => {
      await this.fetchPrices();
      this.updatePresence(discordClient);
    }, 5 * 60 * 1000); // 5 minutes

    // Rotate crypto every 10 seconds for testing (change to 5 minutes later)
    this.rotationInterval = setInterval(() => {
      this.rotateCrypto();
      this.updatePresence(discordClient);
    }, 10 * 1000); // 10 seconds for testing

    console.log('✅ Crypto Price Service started');
    console.log('⏰ Prices update every 5 minutes');
    console.log('🔄 Crypto rotation every 10 seconds (testing mode)');
  }

  updatePresence(discordClient) {
    if (!discordClient || !discordClient.user) {
      return;
    }

    const activityText = this.getCurrentPrice();
    
    discordClient.user.setPresence({
      activities: [{
        name: activityText,
        type: 3 // WATCHING
      }],
      status: 'online'
    });

    console.log(`🤖 Updated bot presence: ${activityText}`);
  }

  stopService() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    
    console.log('🛑 Crypto Price Service stopped');
  }
}

module.exports = CryptoPriceService;
