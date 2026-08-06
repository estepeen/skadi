const AlertsDatabase = require('./alertsDatabase');
const { fetchWithRetry } = require('../utils/httpClient');
const config = require('../config');
// The key can be an auto-minted free one that rotates at runtime, so it has to
// be read per request instead of captured from the env at load time.
const { getCurrentKey, forceRenew } = require('../utils/openseaKey');

/**
 * Shared header block for every OpenSea request, so a renewed key is picked up
 * by both polling loops without them caching it.
 */
function openseaHeaders() {
  return {
    'X-API-KEY': getCurrentKey() || '',
    'Accept': 'application/json'
  };
}

/**
 * Renew the key when OpenSea rejects it. Never throws and never retries inline -
 * the caller skips the current item and the next pass uses the new key.
 */
async function renewKeyAfterAuthFailure() {
  try {
    await forceRenew('alerts monitor 401');
  } catch (error) {
    console.log(`⚠️ Could not renew OpenSea key after 401: ${error.message}`);
  }
}

class AlertsMonitor {
  constructor(discordNotifier, alertsDatabase = null) {
    this.alertsDb = alertsDatabase || new AlertsDatabase();
    this.discordNotifier = discordNotifier;
    this.initialized = false;
    this.floorPriceCache = new Map(); // slug-chain -> { price, timestamp }
    this.FLOOR_PRICE_CHECK_INTERVAL = 60 * 1000; // 1 minute
    // Must outlive the 60 s pass interval, otherwise every entry is pruned
    // before a later pass can ever read it and the cache never hits
    this.FLOOR_PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    this.floorPriceInterval = null;
    this.tokenListingInterval = null;
    // Each loop owns its stop flag and generation counter so restarting one
    // loop cannot revive or duplicate the other
    this.floorPriceStopped = false;
    this.tokenListingStopped = false;
    this.floorPriceGeneration = 0;
    this.tokenListingGeneration = 0;
    this.seenListingIdentities = new Map(); // alertId -> Set of order hashes already reported
    // Price-threshold alerts dedupe on the cheapest listing only: an unrelated
    // new order must not re-fire the same, unchanged cheapest listing
    this.lastCheapestIdentity = new Map(); // alertId -> order hash of the cheapest listing
    this.lastFiredAt = new Map(); // alertId -> timestamp of the last delivered alert
    this.deliveryFailures = new Map(); // alertId -> consecutive failed sends
    // Without usable hashes dedupe is impossible, so cap how often such an
    // alert may fire instead of pinging every pass
    this.UNDEDUPED_FIRE_INTERVAL = 15 * 60 * 1000; // 15 minutes
    this.MAX_DELIVERY_FAILURES = 5;
  }

  async initialize() {
    if (this.initialized) {
      console.log('ℹ️ Alerts Monitor already initialized, skipping');
      return true;
    }
    console.log('🔧 Initializing Alerts Monitor...');
    const success = await this.alertsDb.initialize();
    if (success) {
      this.initialized = true;
      console.log('✅ Alerts Monitor initialized');
      console.log('🔧 Starting periodic monitoring...');
      
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
    if (this.floorPriceInterval) clearTimeout(this.floorPriceInterval);
    this.floorPriceStopped = false;
    // A pass belonging to an older generation must not reschedule itself,
    // otherwise a restart during an in-flight pass leaves two loops running
    const generation = ++this.floorPriceGeneration;

    // Self-rescheduling loop: a pass must finish before the next one is queued,
    // otherwise slow passes overlap and compound the OpenSea request rate
    const runPass = async () => {
      console.log('⏰ Floor price monitoring pass triggered');
      console.log(`🔍 AlertsMonitor initialized: ${this.initialized}`);
      console.log(`🔍 Database initialized: ${this.alertsDb.initialized}`);
      try {
        await this.checkAllCollectionAlerts();
      } catch (error) {
        // A non-Error throw must not break the reschedule below
        console.error('❌ Floor price monitoring pass failed:', error?.message ?? error);
      } finally {
        if (!this.floorPriceStopped && generation === this.floorPriceGeneration) {
          this.floorPriceInterval = setTimeout(runPass, 60 * 1000);
        }
      }
    };

    this.floorPriceInterval = setTimeout(runPass, 60 * 1000);
    console.log('🔄 Started periodic floor price monitoring (every 1 minute)');
  }

  startTokenListingMonitoring() {
    if (this.tokenListingInterval) clearTimeout(this.tokenListingInterval);
    this.tokenListingStopped = false;
    const generation = ++this.tokenListingGeneration;

    const runPass = async () => {
      try {
        await this.checkAllTokenListingAlerts();
      } catch (error) {
        console.error('❌ Token listing monitoring pass failed:', error?.message ?? error);
      } finally {
        if (!this.tokenListingStopped && generation === this.tokenListingGeneration) {
          this.tokenListingInterval = setTimeout(runPass, 60 * 1000);
        }
      }
    };

    this.tokenListingInterval = setTimeout(runPass, 60 * 1000);
    console.log('🔄 Started periodic token listing monitoring (every 1 minute)');
  }

  stop() {
    this.floorPriceStopped = true;
    this.tokenListingStopped = true;
    if (this.floorPriceInterval) {
      clearTimeout(this.floorPriceInterval);
      this.floorPriceInterval = null;
    }
    if (this.tokenListingInterval) {
      clearTimeout(this.tokenListingInterval);
      this.tokenListingInterval = null;
    }
    console.log('🛑 Alerts Monitor stopped');
  }

  async checkAllCollectionAlerts() {
    if (!this.initialized) {
      console.log('❌ AlertsMonitor not initialized, skipping collection alerts check');
      return;
    }

    try {
      const allAlerts = this.alertsDb.getActiveAlerts();
      console.log(`🔍 Total active alerts: ${allAlerts.length}`);
      
      const collectionAlerts = allAlerts.filter(alert => alert.type === 'collection');
      console.log(`🔍 Collection alerts found: ${collectionAlerts.length}`);
      
      if (collectionAlerts.length === 0) {
        console.log('⚠️ No collection alerts to check');
        return;
      }

      console.log(`🔍 Checking ${collectionAlerts.length} collection alerts for floor price changes...`);

      // Group alerts by collection slug to avoid duplicate API calls
      const alertsBySlug = new Map();
      for (const alert of collectionAlerts) {
        const key = `${alert.slug}|${alert.chain}`;
        if (!alertsBySlug.has(key)) {
          alertsBySlug.set(key, []);
        }
        alertsBySlug.get(key).push(alert);
      }

      // Check each unique collection
      for (const [slugChain, alerts] of alertsBySlug) {
        const [slug, chain] = slugChain.split('|');
        console.log(`🔍 Processing ${alerts.length} alerts for ${slug} on ${chain}`);
        
        const currentFloorPrice = await this.getCollectionFloorPrice(slug, chain);
        if (currentFloorPrice) {
          console.log(`📊 ${slug} current floor: ${currentFloorPrice} ETH`);
          for (const alert of alerts) {
            await this.checkCollectionAlert(alert, currentFloorPrice);
          }
        } else {
          console.log(`⚠️ Could not get floor price for ${slug} on ${chain}`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('❌ Error checking collection alerts:', error.message);
    }
  }



  async checkCollectionAlert(alert, currentFloorPrice) {
    const { condition, price: alertPrice, userId, id: alertId, collectionName, slug } = alert;
    
    console.log(`🔍 Checking alert ${alertId}: ${collectionName} (${slug}) - condition: ${condition}, alertPrice: ${alertPrice}, currentFloor: ${currentFloorPrice}`);
    
    let triggered = false;

    if (condition === 'below' && currentFloorPrice < alertPrice) {
      triggered = true;
      console.log(`✅ ALERT TRIGGERED! ${collectionName} floor ${currentFloorPrice} ETH is BELOW ${alertPrice} ETH`);
    } else if (condition === 'above' && currentFloorPrice > alertPrice) {
      triggered = true;
      console.log(`✅ ALERT TRIGGERED! ${collectionName} floor ${currentFloorPrice} ETH is ABOVE ${alertPrice} ETH`);
    } else {
      console.log(`❌ Alert NOT triggered: ${collectionName} floor ${currentFloorPrice} ETH is NOT ${condition} ${alertPrice} ETH`);
    }

    if (triggered) {
      console.log(`🚨 SENDING ALERT for ${collectionName} - floor ${currentFloorPrice} ETH vs alert ${alertPrice} ETH`);
      const sent = await this.sendCollectionAlert(alert, currentFloorPrice);

      // A failed delivery must not consume the alert - leave it active so the
      // next pass retries, but only up to the failure ceiling
      if (!sent) {
        await this.registerDeliveryFailure(alert);
        return;
      }

      this.registerDeliverySuccess(alertId);

      // Deactivate the alert after triggering
      if (alert.mode !== 'repeat') {
        console.log(`🔄 Deactivating alert ${alertId} (mode: ${alert.mode})`);
        await this.alertsDb.updateAlert(userId, alertId, { active: false, triggeredAt: new Date().toISOString() });
      } else {
        console.log(`🔄 Keeping alert ${alertId} active (repeat mode)`);
      }
    }
  }

  // channels.cache is only populated lazily, so an alert in an uncached channel
  // could never fire. Fall back to an API fetch; null means genuinely not found.
  // Everything runs inside the try: a missing client used to throw a TypeError
  // that the callers logged as "Error sending ... alert", masking the cause.
  async resolveAlertChannel(channelId) {
    try {
      const client = this.discordNotifier?.getClient();
      if (!client) {
        console.error(`❌ Discord client not available, cannot resolve alert channel ${channelId}`);
        return null;
      }

      const cached = client.channels.cache.get(channelId);
      if (cached) return cached;

      return await client.channels.fetch(channelId);
    } catch (error) {
      console.error(`❌ Could not fetch alert channel ${channelId}:`, error?.message ?? error);
      return null;
    }
  }

  // Keeping a failed alert active is right, but unbounded: a deleted or
  // unwritable channel fails forever and would retry every 60 s for the
  // lifetime of the process. Give up after MAX_DELIVERY_FAILURES.
  async registerDeliveryFailure(alert) {
    const alertId = alert.id;
    const failures = (this.deliveryFailures.get(alertId) || 0) + 1;

    if (failures >= this.MAX_DELIVERY_FAILURES) {
      console.warn(`⚠️ Alert ${alertId} deactivated after ${failures} consecutive delivery failures to channel ${alert.channelId}`);
      this.deliveryFailures.delete(alertId);
      await this.alertsDb.updateAlert(alert.userId, alertId, { active: false });
      return;
    }

    this.deliveryFailures.set(alertId, failures);
    console.warn(`⚠️ Alert ${alertId} was not delivered (failure ${failures}/${this.MAX_DELIVERY_FAILURES}), keeping it active for the next pass`);
  }

  registerDeliverySuccess(alertId) {
    this.deliveryFailures.delete(alertId);
  }

  // Returns true only when the message actually reached Discord
  async sendCollectionAlert(alert, currentFloorPrice) {
    try {
      const channel = await this.resolveAlertChannel(alert.channelId);

      if (!channel) {
        console.error(`❌ Alert channel not found: ${alert.channelId}`);
        return false;
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
        author: {
          name: '⚡ Powered by STPN',
          url: 'https://github.com/estepeen'
        },
        timestamp: new Date().toISOString()
      };

      await channel.send({ content: `<@${alert.userId}> 🚨 **Collection Alert Triggered!**`, embeds: [embed] });
      console.log(`✅ Collection alert sent to user ${alert.username}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending collection alert:', error?.message ?? error);
      return false;
    }
  }

  async getCollectionFloorPrice(slug, chain) {
    const cacheKey = `${slug}-${chain}`;
    const now = Date.now();
    
    console.log(`🔍 Fetching floor price for ${slug} on ${chain}...`);
    
    // Check cache first
    if (this.floorPriceCache.has(cacheKey)) {
      const cached = this.floorPriceCache.get(cacheKey);
      if (now - cached.timestamp < this.FLOOR_PRICE_CACHE_DURATION) {
        console.log(`📊 Using cached floor price for ${slug}: ${cached.price} ETH`);
        return cached.price;
      }
    }

    try {
      // Fetch from OpenSea API
      const url = `https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}/stats`;
      console.log(`🌐 Fetching from: ${url}`);
      
      const response = await fetchWithRetry(url, {
        headers: openseaHeaders()
      });

      if (!response.ok) {
        console.error(`❌ OpenSea API error for ${slug}: ${response.status} ${response.statusText}`);
        if (response.status === 401) {
          await renewKeyAfterAuthFailure();
          return null;
        }
        throw new Error(`OpenSea API error: ${response.status}`);
      }

      const data = await response.json();
      const floorPrice = data.total?.floor_price;
      console.log(`📊 OpenSea stats for ${slug}: floor ${floorPrice ?? 'n/a'}`);

      if (floorPrice && floorPrice > 0) {
        console.log(`✅ Got floor price for ${slug}: ${floorPrice} ETH`);
        // Cache the result
        this.floorPriceCache.set(cacheKey, {
          price: floorPrice,
          timestamp: now
        });
        
        return floorPrice;
      } else {
        console.log(`⚠️ No floor price data for ${slug} on ${chain}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching floor price for ${slug} on ${chain}:`, error.message);
    }

    return null;
  }

  // Drop per-alert and per-collection state that no longer belongs to an active
  // alert, otherwise these maps grow for the lifetime of the process
  pruneStaleState(activeAlerts) {
    const activeAlertIds = new Set(activeAlerts.map(a => a.id));
    const perAlertMaps = [
      this.seenListingIdentities,
      this.lastCheapestIdentity,
      this.lastFiredAt,
      this.deliveryFailures
    ];

    for (const map of perAlertMaps) {
      for (const alertId of map.keys()) {
        if (!activeAlertIds.has(alertId)) {
          map.delete(alertId);
        }
      }
    }

    // The floor price cache is keyed by collection, so it survives alert
    // removal - drop entries no active collection alert can still use
    const activeCacheKeys = new Set(
      activeAlerts.filter(a => a.type === 'collection').map(a => `${a.slug}-${a.chain}`)
    );
    const now = Date.now();
    for (const [cacheKey, cached] of this.floorPriceCache) {
      const expired = now - cached.timestamp >= this.FLOOR_PRICE_CACHE_DURATION;
      if (expired || !activeCacheKeys.has(cacheKey)) {
        this.floorPriceCache.delete(cacheKey);
      }
    }
  }

  // Periodically check listings for token alerts (any_listing, listed_below, listed_above)
  async checkAllTokenListingAlerts() {
    if (!this.initialized) return;

    try {
      const allAlerts = this.alertsDb.getActiveAlerts();

      this.pruneStaleState(allAlerts);

      const tokenAlerts = allAlerts.filter(a => a.type === 'token' && ['any_listing', 'listed_below', 'listed_above'].includes(a.condition));

      if (tokenAlerts.length === 0) return;

      // Group by token to minimize API calls
      const byToken = new Map();
      for (const alert of tokenAlerts) {
        const key = `${alert.chain}|${alert.contract}|${alert.tokenId}`;
        if (!byToken.has(key)) byToken.set(key, []);
        byToken.get(key).push(alert);
      }
      
      console.log(`🔍 Token listing monitoring: ${byToken.size} unique tokens to check`);

      for (const [key, alerts] of byToken) {
        const [chain, contract, tokenId] = key.split('|');
        console.log(`🔍 Checking token ${contract}/${tokenId} on ${chain} - ${alerts.length} alerts`);
        
        const lowest = await this.fetchTokenLowestListingPrice(chain, contract, tokenId);
        if (lowest == null) {
          console.log(`⚠️ No active listings for ${contract}/${tokenId} on ${chain}`);
          // Trigger any_listing if listing disappeared? No. Only when new listing appears; handled on next cycles
        } else {
          console.log(`💰 Found listing for ${contract}/${tokenId} on ${chain}: ${lowest.price} ETH`);
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

  // Returns { price, identities, cheapestIdentity } for the active listings of a
  // token, or null.
  // price is the cheapest listing (listed_below / listed_above compare against it).
  // identities is the Set of order hashes of every listing that has one, so a new
  // non-floor listing is still recognised as new by any_listing. Listings without
  // a hash are simply unrepresented - the hashes that are present still work.
  // cheapestIdentity is the hash of the cheapest listing (null when it has none),
  // which is what the price-threshold conditions dedupe on. Never fall back to
  // the price as an identity: it would suppress a genuinely new listing that
  // happens to be priced the same.
  async fetchTokenLowestListingPrice(chain, contract, tokenId) {
    try {
      const url = `https://api.opensea.io/api/v2/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(contract)}/nfts/${encodeURIComponent(tokenId)}/listings?limit=10`;
      const res = await fetchWithRetry(url, {
        headers: openseaHeaders()
      });
      if (!res.ok) {
        console.log(`⚠️ Listings fetch failed: ${res.status} for ${contract}/${tokenId}`);
        if (res.status === 401) {
          await renewKeyAfterAuthFailure();
        }
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
      // Prefer an order hash so the same listing is recognised across passes.
      // No hash means no reliable identity - never fall back to the price.
      const extractIdentity = (l) => l?.order_hash || l?.hash || null;

      let min = Infinity;
      let cheapestIdentity = null;
      const identities = new Set();
      for (const l of listings) {
        const p = extractPrice(l);
        if (typeof p === 'number' && isFinite(p) && p > 0) {
          const identity = extractIdentity(l);
          if (p < min) {
            min = p;
            cheapestIdentity = identity;
          }
          if (identity) {
            identities.add(identity);
          }
        }
      }
      if (!isFinite(min)) return null;
      return { price: min, identities, cheapestIdentity };
    } catch (e) {
      console.error('❌ Error fetching token listings:', e.message);
      return null;
    }
  }

  async evaluateTokenListingAlert(alert, lowest) {
    const { condition, price: alertPrice, userId, id: alertId, nftName, tokenId } = alert;

    const lowestPrice = lowest?.price ?? null;
    const listingIdentities = lowest?.identities ?? null;
    const cheapestIdentity = lowest?.cheapestIdentity ?? null;

    console.log(`🔍 Checking token alert ${alertId}: ${nftName} (${tokenId}) - condition: ${condition}, alertPrice: ${alertPrice}, lowestListing: ${lowestPrice}`);

    // The two conditions need different dedupe keys:
    // - any_listing is about the token gaining ANY unseen order, so it compares
    //   the whole identity set.
    // - listed_below / listed_above only ever report the cheapest listing, so
    //   they must compare that one identity. Using the whole set here would
    //   re-fire the same unchanged cheapest listing whenever an unrelated order
    //   appeared on the token.
    // dedupeApplied stays false when the hashes needed were missing.
    let dedupeApplied = false;

    if (condition === 'any_listing') {
      if (listingIdentities && listingIdentities.size > 0) {
        dedupeApplied = true;
        const seen = this.seenListingIdentities.get(alertId);
        const hasNewListing = [...listingIdentities].some(identity => !seen || !seen.has(identity));
        if (!hasNewListing) {
          console.log(`⏭️ Token alert ${alertId} skipped: no new listing since last check`);
          return;
        }
      }
    } else if (cheapestIdentity) {
      dedupeApplied = true;
      if (this.lastCheapestIdentity.get(alertId) === cheapestIdentity) {
        console.log(`⏭️ Token alert ${alertId} skipped: cheapest listing unchanged since last check`);
        return;
      }
    }

    let triggered = false;
    let alertType = 'LISTED';

    if (condition === 'any_listing' && lowestPrice != null) {
      triggered = true; 
      console.log(`✅ TOKEN ALERT TRIGGERED! ${nftName} - ANY LISTING at ${lowestPrice} ETH`);
    }
    if (condition === 'listed_below' && lowestPrice != null && alertPrice != null && lowestPrice < alertPrice) {
      triggered = true; 
      alertType = 'LISTED BELOW';
      console.log(`✅ TOKEN ALERT TRIGGERED! ${nftName} - LISTED BELOW ${alertPrice} ETH at ${lowestPrice} ETH`);
    }
    if (condition === 'listed_above' && lowestPrice != null && alertPrice != null && lowestPrice > alertPrice) {
      triggered = true; 
      alertType = 'LISTED ABOVE';
      console.log(`✅ TOKEN ALERT TRIGGERED! ${nftName} - LISTED ABOVE ${alertPrice} ETH at ${lowestPrice} ETH`);
    }

    if (!triggered) {
      console.log(`❌ Token alert NOT triggered: ${nftName} - condition not met`);
      return;
    }

    // No usable hash means no dedupe, and a repeat-mode alert would then ping
    // every 60 s for as long as the condition holds. Rate-limit instead.
    if (!dedupeApplied) {
      const lastFired = this.lastFiredAt.get(alertId);
      if (lastFired != null && Date.now() - lastFired < this.UNDEDUPED_FIRE_INTERVAL) {
        console.warn(`⚠️ Token alert ${alertId} suppressed: listings carry no usable hash and it already fired within the last ${this.UNDEDUPED_FIRE_INTERVAL / 60000} minutes`);
        return;
      }
    }

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
    const sent = await this.sendTokenAlert(alert, txData, alertType);

    // A failed delivery must not consume the alert or the dedupe slot,
    // but it may not retry forever either
    if (!sent) {
      await this.registerDeliveryFailure(alert);
      return;
    }

    this.registerDeliverySuccess(alertId);
    this.lastFiredAt.set(alertId, Date.now());

    // Replace rather than merge: hashes that disappeared are dropped, so a
    // delisted-then-relisted item fires again and the set cannot grow unbounded
    if (listingIdentities && listingIdentities.size > 0) {
      this.seenListingIdentities.set(alertId, new Set(listingIdentities));
    }
    if (cheapestIdentity) {
      this.lastCheapestIdentity.set(alertId, cheapestIdentity);
    }

    // Honor the alert's own mode: only 'repeat' stays active after triggering
    if (alert.mode !== 'repeat') {
      console.log(`🔄 Deactivating token alert ${alertId} (mode: ${alert.mode})`);
      await this.alertsDb.updateAlert(userId, alertId, { active: false, triggeredAt: new Date().toISOString() });
      this.seenListingIdentities.delete(alertId);
      this.lastCheapestIdentity.delete(alertId);
      this.lastFiredAt.delete(alertId);
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
    const { condition, userId, id: alertId } = alert;
    const transactionPrice = transactionData.priceUSD || 0;
    let triggered = false;
    let alertType = '';

    // Only 'sold' is evaluated here. listed_below / listed_above belong to
    // evaluateTokenListingAlert, which compares native-token listing prices
    // against the native-token threshold the user entered. This path only has
    // transactionData.priceUSD, so comparing it to alert.price would pit USD
    // against ETH - a 1 ETH "listed_above" would match a $2500 sale and then
    // deactivate itself, destroying a listing alert that was working.
    if (transactionData.type === 'sale' && condition === 'sold' && transactionPrice > 0) {
      triggered = true;
      alertType = 'SOLD';
    }

    if (triggered) {
      console.log(`🚨 TOKEN ALERT TRIGGERED! ${alert.nftName} - ${alertType}`);
      const sent = await this.sendTokenAlert(alert, transactionData, alertType);

      // A failed delivery must not consume the alert, but it shares the same
      // 5-strike ceiling as the other senders - and a success here must reset
      // the counter, otherwise a streak from the listing loop survives and the
      // next failure there deactivates an alert that is delivering fine
      if (!sent) {
        await this.registerDeliveryFailure(alert);
        return;
      }

      this.registerDeliverySuccess(alertId);

      // Deactivate according to mode (repeat keeps active)
      if (alert.mode !== 'repeat') {
        await this.alertsDb.updateAlert(userId, alertId, { active: false, triggeredAt: new Date().toISOString() });
      }
    }
  }

  // Returns true only when the message actually reached Discord
  async sendTokenAlert(alert, transactionData, alertType) {
    try {
      const channel = await this.resolveAlertChannel(alert.channelId);

      if (!channel) {
        console.error(`❌ Alert channel not found: ${alert.channelId}`);
        return false;
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
        author: {
          name: '⚡ Powered by STPN',
          url: 'https://github.com/estepeen'
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

      await channel.send({ content: `<@${alert.userId}> 🚨 **Token Alert Triggered!**`, embeds: [embed] });
      console.log(`✅ Token alert sent to user ${alert.username}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending token alert:', error?.message ?? error);
      return false;
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
