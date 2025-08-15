const AlertsDatabase = require('./alertsDatabase');
const fetch = require('node-fetch');
const config = require('../config');

class AlertsMonitor {
  constructor(discordNotifier) {
    this.alertsDb = new AlertsDatabase();
    this.discordNotifier = discordNotifier;
    this.initialized = false;
    this.lastFloorPriceCheck = new Map(); // slug -> timestamp
    this.floorPriceCache = new Map(); // slug -> { price, timestamp }
    this.FLOOR_PRICE_CHECK_INTERVAL = 60 * 1000; // 1 minute
    this.FLOOR_PRICE_CACHE_DURATION = 60 * 1000; // 1 minute
  }

  async initialize() {
    const success = await this.alertsDb.initialize();
    if (success) {
      this.initialized = true;
      console.log('✅ Alerts Monitor initialized');
      
      // Start periodic floor price monitoring
      this.startFloorPriceMonitoring();
      // Start periodic token listing monitoring
      this.startTokenListingMonitoring();
    } else {
      console.error('❌ Failed to initialize Alerts Monitor');
    }
    return success;
  }

  startFloorPriceMonitoring() {
    // Check floor prices every 1 minute
    setInterval(() => {
      this.checkAllCollectionAlerts();
    }, 60 * 1000);
    
    console.log('🔄 Started periodic floor price monitoring (every 1 minute)');
  }

  startTokenListingMonitoring() {
    // Check token listings every 1 minute
    setInterval(() => {
      this.checkAllTokenListingAlerts();
    }, 60 * 1000);

    console.log('🔄 Started periodic token listing monitoring (every 1 minute)');
  }

  async checkAllCollectionAlerts() {
    if (!this.initialized) return;

    try {
      const allAlerts = this.alertsDb.getActiveAlerts();
      const collectionAlerts = allAlerts.filter(alert => alert.type === 'collection');
      
      if (collectionAlerts.length === 0) return;

      console.log(`🔍 Checking ${collectionAlerts.length} collection alerts for floor price changes...`);

      // Group alerts by collection slug to avoid duplicate API calls
      const alertsBySlug = new Map();
      for (const alert of collectionAlerts) {
        const key = `${alert.slug}-${alert.chain}`;
        if (!alertsBySlug.has(key)) {
          alertsBySlug.set(key, []);
        }
        alertsBySlug.get(key).push(alert);
      }

      // Check each unique collection
      for (const [slugChain, alerts] of alertsBySlug) {
        const [slug, chain] = slugChain.split('-');
        await this.checkCollectionFloorPrice(slug, chain, alerts);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('❌ Error checking collection alerts:', error.message);
    }
  }

  async checkCollectionFloorPrice(slug, chain, alerts) {
    try {
      const currentFloorPrice = await this.getCollectionFloorPrice(slug, chain);
      if (!currentFloorPrice) return;

      console.log(`📊 ${slug} floor price: ${currentFloorPrice} ETH`);

      for (const alert of alerts) {
        await this.checkCollectionAlert(alert, currentFloorPrice);
      }
    } catch (error) {
      console.error(`❌ Error checking floor price for ${slug}:`, error.message);
    }
  }

  async checkCollectionAlert(alert, currentFloorPrice) {
    const { condition, price: alertPrice, userId, id: alertId } = alert;
    let triggered = false;

    if (condition === 'below' && currentFloorPrice < alertPrice) {
      triggered = true;
    } else if (condition === 'above' && currentFloorPrice > alertPrice) {
      triggered = true;
    }

    if (triggered) {
      console.log(`🚨 ALERT TRIGGERED! ${alert.collectionName} floor ${currentFloorPrice} ETH is ${condition} ${alertPrice} ETH`);
      await this.sendCollectionAlert(alert, currentFloorPrice);
      
      // Deactivate the alert after triggering
      if (alert.mode !== 'repeat') {
        await this.alertsDb.updateAlert(userId, alertId, { active: false, triggeredAt: new Date().toISOString() });
      }
    }
  }

  async sendCollectionAlert(alert, currentFloorPrice) {
    try {
      const client = this.discordNotifier.getClient();
      const channel = client.channels.cache.get(alert.channelId);
      
      if (!channel) {
        console.error(`❌ Alert channel not found: ${alert.channelId}`);
        return;
      }

      const embed = {
        title: '🚨 Collection Alert Triggered!',
        description: `**${alert.collectionName}** floor price alert has been triggered.`,
        color: alert.condition === 'below' ? 0xff4444 : 0x44ff44,
        fields: [
          {
            name: '📊 Current Floor Price',
            value: `${currentFloorPrice} ETH`,
            inline: true
          },
          {
            name: '🎯 Alert Condition',
            value: `${alert.condition.toUpperCase()} ${alert.price} ETH`,
            inline: true
          },
          {
            name: '⛓️ Chain',
            value: alert.chain.toUpperCase(),
            inline: true
          },
          {
            name: '🔗 Collection Link',
            value: `[View on OpenSea](https://opensea.io/collection/${alert.slug})`,
            inline: false
          },
          {
            name: '⚙️ Manage',
            value: `Use /alerts remove alert_id:${alert.id} to delete this alert`,
            inline: false
          }
        ],
        image: alert.image_url ? { url: alert.image_url } : undefined,
        footer: {
          text: '⚡ Powered by STPNGPT'
        },
        timestamp: new Date().toISOString()
      };

      await channel.send({ content: `<@${alert.userId}>`, embeds: [embed] });
      console.log(`✅ Collection alert sent to user ${alert.username}`);
    } catch (error) {
      console.error('❌ Error sending collection alert:', error.message);
    }
  }

  async getCollectionFloorPrice(slug, chain) {
    const cacheKey = `${slug}-${chain}`;
    const now = Date.now();
    
    // Check cache first
    if (this.floorPriceCache.has(cacheKey)) {
      const cached = this.floorPriceCache.get(cacheKey);
      if (now - cached.timestamp < this.FLOOR_PRICE_CACHE_DURATION) {
        return cached.price;
      }
    }

    try {
      // Fetch from OpenSea API
      const url = `https://api.opensea.io/api/v2/collections/${slug}/stats`;
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': config.opensea.apiKey || '',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenSea API error: ${response.status}`);
      }

      const data = await response.json();
      const floorPrice = data.total?.floor_price;

      if (floorPrice && floorPrice > 0) {
        // Cache the result
        this.floorPriceCache.set(cacheKey, {
          price: floorPrice,
          timestamp: now
        });
        
        return floorPrice;
      }
    } catch (error) {
      console.error(`❌ Error fetching floor price for ${slug}:`, error.message);
    }

    return null;
  }

  // Periodically check listings for token alerts (any_listing, listed_below, listed_above)
  async checkAllTokenListingAlerts() {
    if (!this.initialized) return;

    try {
      const allAlerts = this.alertsDb.getActiveAlerts();
      const tokenAlerts = allAlerts.filter(a => a.type === 'token' && ['any_listing', 'listed_below', 'listed_above'].includes(a.condition));

      if (tokenAlerts.length === 0) return;

      // Group by token to minimize API calls
      const byToken = new Map();
      for (const alert of tokenAlerts) {
        const key = `${alert.chain}|${alert.contract}|${alert.tokenId}`;
        if (!byToken.has(key)) byToken.set(key, []);
        byToken.get(key).push(alert);
      }

      for (const [key, alerts] of byToken) {
        const [chain, contract, tokenId] = key.split('|');
        const lowest = await this.fetchTokenLowestListingPrice(chain, contract, tokenId);
        if (lowest == null) {
          // no active listings
          // Trigger any_listing if listing disappeared? No. Only when new listing appears; handled on next cycles
        } else {
          for (const alert of alerts) {
            await this.evaluateTokenListingAlert(alert, lowest);
          }
        }
        // Avoid rate limits
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (error) {
      console.error('❌ Error checking token listing alerts:', error.message);
    }
  }

  async fetchTokenLowestListingPrice(chain, contract, tokenId) {
    try {
      const url = `https://api.opensea.io/api/v2/chain/${chain}/contract/${contract}/nfts/${tokenId}/listings?limit=10`;
      const res = await fetch(url, {
        headers: { 'X-API-KEY': config.opensea.apiKey || '', 'Accept': 'application/json' }
      });
      if (!res.ok) {
        console.log(`⚠️ Listings fetch failed: ${res.status} for ${contract}/${tokenId}`);
        return null;
      }
      const data = await res.json();
      const listings = Array.isArray(data.listings) ? data.listings : (Array.isArray(data) ? data : []);
      if (!listings.length) return null;

      // Try to normalize price in native units (ETH/chain native). Different payloads may shape price differently.
      const extractPrice = (l) => {
        // prefer l.price.current.value (float) or l.price.value
        if (l?.price?.current?.value) return Number(l.price.current.value);
        if (l?.price?.value) return Number(l.price.value);
        if (l?.price) return Number(l.price);
        if (l?.protocol_data?.parameters?.startAmount) return Number(l.protocol_data.parameters.startAmount);
        return NaN;
      };
      let min = Infinity;
      for (const l of listings) {
        const p = extractPrice(l);
        if (typeof p === 'number' && isFinite(p) && p > 0) {
          if (p < min) min = p;
        }
      }
      if (!isFinite(min)) return null;
      return min;
    } catch (e) {
      console.error('❌ Error fetching token listings:', e.message);
      return null;
    }
  }

  async evaluateTokenListingAlert(alert, lowestPrice) {
    const { condition, price: alertPrice, userId, id: alertId } = alert;
    let triggered = false;
    let alertType = 'LISTED';

    if (condition === 'any_listing' && lowestPrice != null) triggered = true;
    if (condition === 'listed_below' && lowestPrice != null && alertPrice != null && lowestPrice < alertPrice) {
      triggered = true; alertType = 'LISTED BELOW';
    }
    if (condition === 'listed_above' && lowestPrice != null && alertPrice != null && lowestPrice > alertPrice) {
      triggered = true; alertType = 'LISTED ABOVE';
    }

    if (!triggered) return;

    // Prepare lightweight transaction-like data for embed
    const txData = {
      type: 'listing',
      nftName: alert.nftName,
      tokenId: alert.tokenId,
      contractAddress: alert.contract,
      chainName: alert.chain,
      priceUSD: null,
      imageUrl: null,
      transactionHash: null,
      timestamp: new Date().toISOString()
    };
    await this.sendTokenAlert(alert, txData, alertType);
    // Keep any_listing active for future listings; others deactivate
    if (condition !== 'any_listing') {
      await this.alertsDb.updateAlert(userId, alertId, { active: false, triggeredAt: new Date().toISOString() });
    }
  }

  // Check if a specific NFT transaction matches any token alerts
  async checkTokenAlerts(transactionData) {
    if (!this.initialized) return;

    try {
      const allAlerts = this.alertsDb.getActiveAlerts();
      const tokenAlerts = allAlerts.filter(alert => 
        alert.type === 'token' && 
        alert.contract && transactionData.contractAddress &&
        alert.contract.toLowerCase() === transactionData.contractAddress.toLowerCase() &&
        String(alert.tokenId) === String(transactionData.tokenId)
      );

      if (tokenAlerts.length === 0) return;

      console.log(`🔍 Found ${tokenAlerts.length} token alerts for ${transactionData.nftName}`);

      for (const alert of tokenAlerts) {
        await this.checkTokenAlert(alert, transactionData);
      }
    } catch (error) {
      console.error('❌ Error checking token alerts:', error.message);
    }
  }

  async checkTokenAlert(alert, transactionData) {
    const { condition, price: alertPrice, userId, id: alertId } = alert;
    const transactionPrice = transactionData.priceUSD || 0;
    let triggered = false;
    let alertType = '';

    // Handle sales (from NFT tracker)
    if (transactionData.type === 'sale') {
      if (condition === 'sold' && transactionPrice > 0) {
        triggered = true;
        alertType = 'SOLD';
      } else if (condition === 'listed_below' && transactionPrice < alertPrice && transactionPrice > 0) {
        triggered = true;
        alertType = 'SOLD BELOW';
      } else if (condition === 'listed_above' && transactionPrice > alertPrice) {
        triggered = true;
        alertType = 'SOLD ABOVE';
      }
    }

    if (triggered) {
      console.log(`🚨 TOKEN ALERT TRIGGERED! ${alert.nftName} - ${alertType}`);
      await this.sendTokenAlert(alert, transactionData, alertType);
      
      // Deactivate according to mode (repeat keeps active)
      if (alert.mode !== 'repeat' && condition !== 'any_listing') {
        await this.alertsDb.updateAlert(userId, alertId, { active: false, triggeredAt: new Date().toISOString() });
      }
    }
  }

  async sendTokenAlert(alert, transactionData, alertType) {
    try {
      const client = this.discordNotifier.getClient();
      const channel = client.channels.cache.get(alert.channelId);
      
      if (!channel) {
        console.error(`❌ Alert channel not found: ${alert.channelId}`);
        return;
      }

      const embed = {
        title: `🚨 Token Alert Triggered!`,
        description: `**${alert.nftName}** - ${alertType}`,
        color: alertType.includes('SOLD') ? 0xff4444 : alertType.includes('LISTED') ? 0x44ff44 : 0xffaa00,
        fields: [
          {
            name: '🎨 NFT',
            value: `${alert.nftName}\nToken ID: ${alert.tokenId}`,
            inline: true
          },
          {
            name: '💰 Transaction Price',
            value: transactionData.priceUSD ? `$${transactionData.priceUSD.toFixed(2)}` : 'N/A',
            inline: true
          },
          {
            name: '⛓️ Chain',
            value: alert.chain.toUpperCase(),
            inline: true
          },
          {
            name: '⚙️ Manage',
            value: `Use /alerts remove alert_id:${alert.id} to delete this alert`,
            inline: false
          }
        ],
        image: (transactionData.imageUrl || alert.image_url) ? { url: (transactionData.imageUrl || alert.image_url) } : undefined,
        footer: {
          text: '⚡ Powered by STPNGPT'
        },
        timestamp: new Date().toISOString()
      };

      if (transactionData.imageUrl) {
        embed.thumbnail = { url: transactionData.imageUrl };
      }

      if (transactionData.transactionHash) {
        embed.fields.push({
          name: '🔗 Transaction',
          value: `[View Transaction](https://etherscan.io/tx/${transactionData.transactionHash})`,
          inline: false
        });
      }

      await channel.send({ content: `<@${alert.userId}>`, embeds: [embed] });
      console.log(`✅ Token alert sent to user ${alert.username}`);
    } catch (error) {
      console.error('❌ Error sending token alert:', error.message);
    }
  }

  // Check traits alerts (for future implementation)
  async checkTraitsAlerts(transactionData) {
    // TODO: Implement traits-based alerts
    // This would require fetching NFT metadata and checking traits
    console.log('🔍 Traits alerts checking not yet implemented');
  }

  // Get alerts statistics
  getStats() {
    if (!this.initialized) return null;
    
    const allAlerts = this.alertsDb.getAllAlerts();
    const activeAlerts = this.alertsDb.getActiveAlerts();
    
    const stats = {
      total: allAlerts.length,
      active: activeAlerts.length,
      byType: {
        collection: activeAlerts.filter(a => a.type === 'collection').length,
        token: activeAlerts.filter(a => a.type === 'token').length,
        traits: activeAlerts.filter(a => a.type === 'traits').length
      }
    };
    
    return stats;
  }
}

module.exports = AlertsMonitor;
