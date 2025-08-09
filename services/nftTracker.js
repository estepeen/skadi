const config = require('../config');
const DiscordNotifier = require('./discordNotifier');
const fs = require('fs');
const path = require('path');

// Add fetch for Node.js versions that don't have it globally
const fetch = require('node-fetch');

class NFTTracker {
  constructor() {
    this.config = config;
    
    this.trackedWallets = new Map(); // address -> { name, lastChecked }
    this.lastTransactions = new Map(); // address -> last transaction hash
    this.discordNotifier = new DiscordNotifier();
    // Cache for native token USD prices to reduce CoinGecko calls and avoid rate limits
    this.nativeUsdCache = new Map(); // key: chainNameLower -> { price, ts }
    // Deduplication set for OpenSea transaction hashes to avoid duplicate notifications
    this.processedOpenSeaTxHashes = new Set();
    // Track NFT purchases for PnL calculation
    this.nftPurchases = new Map(); // key: contractAddress_tokenId, value: {price, priceUSD, timestamp}
    this.purchasesFile = path.join(__dirname, '../data/purchases.json');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.purchasesFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load existing purchase data
    this.loadPurchaseData();
  }

  /**
   * Build a stable map key for contract + tokenId regardless of hex/decimal representation.
   */
  buildStablePurchaseKey(contractAddress, tokenId) {
    try {
      const contract = (contractAddress || '').toLowerCase();
      if (!contract) return null;
      if (tokenId == null) return `${contract}_unknown`;
      const idStr = String(tokenId);
      if (idStr.startsWith('0x')) {
        // Hex to decimal
        try {
          const dec = BigInt(idStr).toString(10);
          return `${contract}_${dec}`;
        } catch {
          return `${contract}_${idStr}`;
        }
      }
      // Also normalize any accidental floats into integer-like strings
      if (/^\d+(?:\.0+)?$/.test(idStr)) {
        return `${contract}_${idStr.replace(/\.0+$/, '')}`;
      }
      return `${contract}_${idStr}`;
    } catch {
      return null;
    }
  }

  /**
   * Resolve existing purchase key by trying both original and stable forms and hex/dec permutations.
   */
  resolvePurchaseKey(contractAddress, tokenId) {
    const originalKey = `${contractAddress}_${tokenId}`;
    if (this.nftPurchases.has(originalKey)) return originalKey;
    const stableKey = this.buildStablePurchaseKey(contractAddress, tokenId);
    if (stableKey && this.nftPurchases.has(stableKey)) return stableKey;
    // If tokenId is hex, try decimal and vice versa
    try {
      const idStr = String(tokenId);
      if (idStr.startsWith('0x')) {
        const dec = BigInt(idStr).toString(10);
        const decKey = `${(contractAddress || '').toLowerCase()}_${dec}`;
        if (this.nftPurchases.has(decKey)) return decKey;
      } else if (/^\d+$/.test(idStr)) {
        const hex = '0x' + BigInt(idStr).toString(16);
        const hexKey = `${(contractAddress || '').toLowerCase()}_${hex}`;
        if (this.nftPurchases.has(hexKey)) return hexKey;
      }
    } catch {}
    return originalKey; // fall back; may miss but keeps behavior
  }
  // Load purchase data from file
  loadPurchaseData() {
    try {
      if (fs.existsSync(this.purchasesFile)) {
        const data = fs.readFileSync(this.purchasesFile, 'utf8');
        const purchases = JSON.parse(data);
        this.nftPurchases = new Map(Object.entries(purchases));
        console.log(`📂 Loaded ${this.nftPurchases.size} purchase records from file`);
      }
    } catch (error) {
      console.log('⚠️ Could not load purchase data:', error.message);
      this.nftPurchases = new Map();
    }
  }

  // Save purchase data to file
  savePurchaseData() {
    try {
      const purchases = Object.fromEntries(this.nftPurchases);
      fs.writeFileSync(this.purchasesFile, JSON.stringify(purchases, null, 2));
    } catch (error) {
      console.error('❌ Error saving purchase data:', error.message);
    }
  }

  async initialize(wallets) {
    console.log('Initializing NFT Tracker...');
    
    for (const wallet of wallets) {
      this.trackedWallets.set(wallet.address, {
        address: wallet.address,
        name: wallet.name,
        lastChecked: Date.now(),
        // Start with a small backoff window to avoid missing fresh events due to clock skews
        lastEventTimestamp: Math.floor(Date.now() / 1000) - 300 // 5 min backoff
      });
      console.log(`Tracking wallet: ${wallet.name} (${wallet.address})`);
    }

    // Initialize Discord notifier if configured
    if (config.discord.botToken && config.discord.channelId) {
      try {
        await this.discordNotifier.connect();
        console.log('✅ Discord integration enabled');
      } catch (error) {
        console.error('❌ Discord integration failed:', error.message);
      }
    } else {
      console.log('⚠️ Discord integration disabled - missing bot token or channel ID');
    }

    // Fetch historical purchase data to populate the database
    await this.fetchHistoricalPurchases();
    
    // Save the fetched data
    this.savePurchaseData();
  }

  async checkNFTTransfers(chain = 'ethereum') {
    const chainName = chain === 'ethereum' ? 'Ethereum' : 'Base';
    
    console.log(`\nChecking ${chainName} NFT transfers...`);
    
    for (const [address, walletInfo] of this.trackedWallets) {
      try {
        await this.checkWalletNFTTransfers(address, walletInfo, chainName);
        // Add small delay to avoid rate limiting
        await this.sleep(100);
      } catch (error) {
        console.error(`Error checking wallet ${walletInfo.name}:`, error.message);
      }
    }
  }

  async checkWalletNFTTransfers(address, walletInfo, chainName) {
    try {
      // Get recent transactions from Etherscan/BaseScan
      const transactions = await this.getRecentTransactions(address, chainName);
      
      for (const tx of transactions) {
        const transferKey = `${address}-${tx.hash}`;
        
        // Check if we've already processed this transaction
        if (!this.lastTransactions.has(transferKey)) {
          this.lastTransactions.set(transferKey, true);
          
          // Analyze the transaction
          await this.analyzeTransaction(tx, walletInfo, chainName);
        }
      }

    } catch (error) {
      console.error(`Error getting transfers for ${walletInfo.name}:`, error.message);
    }
  }

  async getRecentTransactions(address, chainName) {
    try {
      const apiKey = config.etherscan.apiKey;
      
      // Map chain names to their respective API endpoints
      const chainApis = {
        'Ethereum': 'https://api.etherscan.io',
        'Base': 'https://api.basescan.org',
        'Polygon': 'https://api.polygonscan.com',
        'Arbitrum': 'https://api.arbiscan.io',
        'Optimism': 'https://api-optimistic.etherscan.io',
        'BSC': 'https://api.bscscan.com',
        'Avalanche': 'https://api.snowtrace.io',
        'Berachain': 'https://api.berascan.com',
        'Abstract': 'https://api.abstract.money'
      };
      
      const baseUrl = chainApis[chainName];
      
      if (!baseUrl) {
        console.log(`⚠️ No API endpoint configured for ${chainName}`);
        return [];
      }
      
      const response = await fetch(`${baseUrl}/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=2&sort=desc&apikey=${apiKey}`);
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        return data.result.filter(tx => 
          tx.isError === '0' && 
          (tx.methodId === '0xa9059cbb' || tx.methodId === '0x23b872dd' || tx.methodId === '0xf242432a')
        );
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching recent transactions:', error.message);
      return [];
    }
  }

  async analyzeTransaction(tx, walletInfo, chainName) {
    try {
      // Determine transaction type based on method ID
      const methodId = tx.methodId;
      let transactionType = 'unknown';
      
      if (methodId === '0x23b872dd') {
        transactionType = 'transfer';
      } else if (methodId === '0xf242432a') {
        transactionType = 'transferFrom';
      } else if (methodId === '0xa9059cbb') {
        transactionType = 'transfer';
      }
      
      if (transactionType === 'unknown') {
        return;
      }
      
      // Get transaction data
      const transactionData = await this.getTransactionData(tx.hash, chainName);
      
      // Determine if this is a purchase or sale
      const walletAddress = typeof walletInfo?.address === 'string' ? walletInfo.address.toLowerCase() : '';
      const isPurchase = typeof tx.to === 'string' && tx.to.toLowerCase() === walletAddress;
      const isSale = typeof tx.from === 'string' && tx.from.toLowerCase() === walletAddress;
      
      if (isPurchase) {
        await this.analyzePurchase(tx, walletInfo, chainName, transactionData);
      } else if (isSale) {
        await this.analyzeSale(tx, walletInfo, chainName, transactionData);
      }
      
    } catch (error) {
      console.error('Error analyzing transaction:', error.message);
    }
  }

  async analyzePurchase(tx, walletInfo, chainName, transactionData) {
    const timestamp = new Date().toLocaleString();
    
    console.log(`\n🟢 NFT PURCHASED on ${chainName}`);
    console.log(`Wallet: ${walletInfo.name} (${tx.to})`);
    console.log(`From: ${tx.from}`);
    console.log(`Transaction: https://${chainName.toLowerCase() === 'ethereum' ? 'etherscan.io' : 'basescan.org'}/tx/${tx.hash}`);
    console.log(`Time: ${timestamp}`);
    console.log('─'.repeat(50));

    // Get NFT metadata
    const nftMetadata = await this.getNFTMetadata(tx.contractAddress, tx.tokenId, chainName);
    
    // Get floor price from OpenSea
    const floorPrice = await this.getFloorPrice(tx.contractAddress, chainName);
    
    // Store purchase data for PnL calculation
    const purchaseKey = `${tx.contractAddress}_${tx.tokenId}`;
    this.nftPurchases.set(purchaseKey, {
      price: transactionData.price,
      priceUSD: transactionData.priceUSD,
      timestamp: new Date(),
      walletAddress: tx.to
    });
    
    // Send Discord notification
    await this.sendDiscordNotification({
      type: 'purchase',
      walletName: walletInfo.name,
      walletAddress: tx.to,
      fromAddress: tx.from,
      tokenName: nftMetadata.name || 'Unknown NFT',
      tokenId: tx.tokenId,
      contractAddress: tx.contractAddress,
      transactionHash: tx.hash,
      chainName: chainName,
      timestamp: new Date(),
      price: transactionData.price,
      priceUSD: transactionData.priceUSD,
      quantity: 1,
      imageUrl: nftMetadata.imageUrl,
      nftName: nftMetadata.name,
      floorPrice: floorPrice
    });
  }

  async analyzeSale(tx, walletInfo, chainName, transactionData) {
    const timestamp = new Date().toLocaleString();
    
    console.log(`\n🔴 NFT SOLD on ${chainName}`);
    console.log(`Wallet: ${walletInfo.name} (${tx.from})`);
    console.log(`To: ${tx.to}`);
    console.log(`Transaction: https://${chainName.toLowerCase() === 'ethereum' ? 'etherscan.io' : 'basescan.org'}/tx/${tx.hash}`);
    console.log(`Time: ${timestamp}`);
    console.log('─'.repeat(50));

    // Get NFT metadata
    const nftMetadata = await this.getNFTMetadata(tx.contractAddress, tx.tokenId, chainName);
    
    // Get floor price from OpenSea
    const floorPrice = await this.getFloorPrice(tx.contractAddress, chainName);
    
    // Get purchase data for PnL calculation
    const purchaseKey = `${tx.contractAddress}_${tx.tokenId}`;
    const purchaseData = this.nftPurchases.get(purchaseKey);
    
    // Send Discord notification
    await this.sendDiscordNotification({
      type: 'sale',
      walletName: walletInfo.name,
      walletAddress: tx.from,
      toAddress: tx.to,
      tokenName: nftMetadata.name || 'Unknown NFT',
      tokenId: tx.tokenId,
      contractAddress: tx.contractAddress,
      transactionHash: tx.hash,
      chainName: chainName,
      timestamp: new Date(),
      price: transactionData.price,
      priceUSD: transactionData.priceUSD,
      quantity: 1,
      imageUrl: nftMetadata.imageUrl,
      nftName: nftMetadata.name,
      floorPrice: floorPrice,
      buyPrice: purchaseData?.price || 0,
      buyPriceUSD: purchaseData?.priceUSD || 0,
      buyTimestamp: purchaseData?.timestamp || null
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendDiscordNotification(transactionData, nftTracker = null) {
    try {
      await this.discordNotifier.sendNotification(transactionData, nftTracker);
    } catch (error) {
      console.error('❌ Failed to send Discord notification:', error.message);
    }
  }

  async startTracking() {
    console.log('Starting NFT tracking via OpenSea API v2...');
    
    while (true) {
      try {
        // Check each wallet's activity on OpenSea
        for (const [address, walletInfo] of this.trackedWallets) {
          console.log(`\n🔍 Checking ${walletInfo.name} activity on OpenSea...`);
          await this.checkWalletActivity(address, walletInfo);
          
          // Add delay between wallets to avoid rate limiting
          await this.sleep(2000); // 2 seconds between wallets
        }
        
        // Wait before next scan (5 minutes)
        console.log(`\n⏱️ Waiting ${config.scanInterval / 1000 / 60} minutes before next scan...`);
        await this.sleep(config.scanInterval);
        
      } catch (error) {
        console.error('Error in tracking loop:', error);
        await this.sleep(10000); // Wait 10 seconds on error
      }
    }
  }

  async getTransactionData(txHash, chainName) {
    try {
      const apiKey = config.etherscan.apiKey;
      
      // Map chain names to their respective API endpoints
      const chainApis = {
        'Ethereum': 'https://api.etherscan.io',
        'Base': 'https://api.basescan.org',
        'Polygon': 'https://api.polygonscan.com',
        'Arbitrum': 'https://api.arbiscan.io',
        'Optimism': 'https://api-optimistic.etherscan.io',
        'BSC': 'https://api.bscscan.com',
        'Avalanche': 'https://api.snowtrace.io',
        'Berachain': 'https://api.berascan.com',
        'Abstract': 'https://api.abstract.money'
      };
      
      const baseUrl = chainApis[chainName];
      
      if (!baseUrl) {
        console.log(`⚠️ No API endpoint configured for ${chainName}`);
        return {
          price: 0,
          priceUSD: 0,
          gasUsed: 0,
          gasPrice: 0
        };
      }
      
      // Get transaction details
      const response = await fetch(`${baseUrl}/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`);
      const data = await response.json();
      
      if (data.result) {
        const tx = data.result;
        const priceInWei = tx.value;
        // Convert hex string to BigInt, then to ETH
        const priceInEth = priceInWei ? Number(BigInt(priceInWei)) / Math.pow(10, 18) : 0;
        
        // Get native token price in USD
        const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
        const priceUSD = priceInEth * nativePriceUSD;
        
        return {
          price: priceInEth,
          priceUSD: priceUSD,
          gasUsed: 0, // Would need separate call to get gas info
          gasPrice: 0
        };
      }
      
      return {
        price: 0,
        priceUSD: 0,
        gasUsed: 0,
        gasPrice: 0
      };
    } catch (error) {
      console.error('Error getting transaction data:', error.message);
      return {
        price: 0,
        priceUSD: 0,
        gasUsed: 0,
        gasPrice: 0
      };
    }
  }

  async getNFTMetadata(contractAddress, tokenId, chainName) {
    try {
      // Handle null tokenId
      if (!tokenId) {
        console.log(`⚠️  Token ID is null for contract ${contractAddress}`);
        return {
          imageUrl: null,
          name: 'Unknown NFT',
          description: null
        };
      }

      // Try OpenSea API for metadata
      try {
        const apiKey = config.opensea.apiKey;
        const chainMap = {
          'Ethereum': 'ethereum',
          'Base': 'base',
          'Polygon': 'polygon',
          'Arbitrum': 'arbitrum',
          'Optimism': 'optimism',
          'BSC': 'bsc',
          'Berachain': 'berachain',
          'Abstract': 'abstract'
        };
        
        const chain = chainMap[chainName] || 'ethereum';
        
        const response = await fetch(`https://api.opensea.io/api/v1/asset/${contractAddress}/${tokenId}/?chain=${chain}`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          return {
            imageUrl: data.image_url || data.image_thumbnail_url || null,
            name: data.name || `#${tokenId}`,
            description: data.description || null
          };
        }
      } catch (openseaError) {
        console.log('OpenSea API failed for metadata, using fallback...');
      }
      
      // Fallback to basic info
      return {
        imageUrl: null,
        name: tokenId ? `#${tokenId}` : 'Unknown NFT',
        description: null
      };
    } catch (error) {
      console.error('Error getting NFT metadata:', error.message);
      return {
        imageUrl: null,
        name: tokenId ? `#${tokenId}` : 'Unknown NFT',
        description: null
      };
    }
  }

  getNativeTokenSymbol(chainName) {
    const symbols = {
      'ethereum': 'ETH',
      'base': 'ETH',
      'berachain': 'BERA',
      'abstract': 'ABS',
      'polygon': 'MATIC',
      'arbitrum': 'ETH',
      'optimism': 'ETH',
      'avalanche': 'AVAX',
      'bsc': 'BNB'
    };
    return symbols[chainName.toLowerCase()] || 'ETH';
  }

  async getNativeTokenPriceUSD(chainName) {
    try {
      // Serve from cache (5 minutes)
      const cacheKey = (chainName || 'ethereum').toLowerCase();
      const cached = this.nativeUsdCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        return cached.price;
      }

      const chainIds = {
        ethereum: 'ethereum',
        base: 'ethereum', // Base uses ETH
        berachain: 'berachain',
        abstract: 'abstract',
        polygon: 'matic-network',
        arbitrum: 'ethereum', // Arbitrum uses ETH
        optimism: 'ethereum', // Optimism uses ETH
        avalanche: 'avalanche-2',
        bsc: 'binancecoin'
      };

      const coinId = chainIds[cacheKey] || 'ethereum';

      // Helper: attempt a series of providers, return first good numeric price
      const tryProviders = [
        // CoinGecko simple/price
        async () => {
          const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`coingecko simple status ${res.status}`);
          const data = await res.json();
          const value = coinId === 'ethereum' ? data?.ethereum?.usd : data?.[coinId]?.usd;
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) throw new Error('coingecko simple missing usd');
          return n;
        },
        // CoinGecko markets (alternative schema)
        async () => {
          const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinId}`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`coingecko markets status ${res.status}`);
          const data = await res.json();
          const n = Number(Array.isArray(data) && data[0] && data[0].current_price);
          if (!Number.isFinite(n) || n <= 0) throw new Error('coingecko markets missing price');
          return n;
        },
        // Coinbase spot price (supports most majors). Map to ticker symbol
        async () => {
          const symbolMap = {
            'ethereum': 'ETH',
            'matic-network': 'MATIC',
            'avalanche-2': 'AVAX',
            'binancecoin': 'BNB'
          };
          const symbol = symbolMap[coinId] || 'ETH';
          const url = `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`coinbase status ${res.status}`);
          const data = await res.json();
          const n = Number(data?.data?.amount);
          if (!Number.isFinite(n) || n <= 0) throw new Error('coinbase missing amount');
          return n;
        },
        // CoinCap as last resort for ETH only
        async () => {
          if (coinId !== 'ethereum') throw new Error('coincap only for ethereum');
          const url = 'https://api.coincap.io/v2/assets/ethereum';
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`coincap status ${res.status}`);
          const data = await res.json();
          const n = Number(data?.data?.priceUsd);
          if (!Number.isFinite(n) || n <= 0) throw new Error('coincap missing price');
          return n;
        }
      ];

      let priceUsd = 0;
      let lastError = null;
      for (const provider of tryProviders) {
        try {
          priceUsd = await provider();
          break;
        } catch (e) {
          lastError = e;
          continue;
        }
      }

      // Fallback hardcoded if all providers failed
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
        priceUsd = 2000;
      }

      // Store in cache and return
      this.nativeUsdCache.set(cacheKey, { price: priceUsd, ts: Date.now() });
      return priceUsd;
    } catch (error) {
      // Quiet fallback to avoid log spam on rate limits
      const fallback = 2000;
      this.nativeUsdCache.set((chainName || 'ethereum').toLowerCase(), { price: fallback, ts: Date.now() });
      return fallback;
    }
  }

  async getCollectionInfoBySlug(slug, chainName) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching collection info by slug: ${slug} on ${chainName}...`);
      
      // Fetch collection info using slug
      const collectionResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (collectionResponse.ok) {
        const collectionData = await collectionResponse.json();
        console.log(`✅ Found collection info for slug: ${slug}`);
        console.log(`📊 Collection name: ${collectionData.name || slug}`);
        console.log(`🔗 Twitter: ${collectionData.twitter_username || 'N/A'}`);
        console.log(`📱 Discord: ${collectionData.discord_url || 'N/A'}`);
        console.log(`🌐 Website: ${collectionData.project_url || 'N/A'}`);
        
        // Add delay before fetching stats to avoid rate limiting
        await this.sleep(200);
        
        // Fetch collection stats using the same slug
        console.log(`🔍 Fetching stats for slug: ${slug}`);
        const statsResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}/stats?chain=${chain}`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        let statsData = null;
        if (statsResponse.ok) {
          statsData = await statsResponse.json();
          console.log(`✅ Stats found - Floor: ${statsData.total?.floor_price || 'N/A'} ETH, Volume: ${statsData.total?.volume || 'N/A'} ETH`);
        } else if (statsResponse.status === 429) {
          console.log(`⚠️ Rate limited on stats API, skipping stats for now`);
        } else {
          console.log(`⚠️ Stats not available: ${statsResponse.status} ${statsResponse.statusText}`);
        }
        
        return {
          name: collectionData.name || slug,
          slug: slug,
          twitter_username: collectionData.twitter_username,
          discord_url: collectionData.discord_url,
          external_url: collectionData.project_url || collectionData.external_url,
          image_url: collectionData.image_url,
          description: collectionData.description,
          opensea_url: collectionData.opensea_url || `https://opensea.io/collection/${slug}`,
          project_url: collectionData.project_url,
          banner_image_url: collectionData.banner_image_url,
          owner: collectionData.owner,
          safelist_status: collectionData.safelist_status,
          category: collectionData.category,
          is_disabled: collectionData.is_disabled,
          is_nsfw: collectionData.is_nsfw,
          trait_offers_enabled: collectionData.trait_offers_enabled,
          collection_offers_enabled: collectionData.collection_offers_enabled,
          wiki_url: collectionData.wiki_url,
          telegram_url: collectionData.telegram_url,
          instagram_username: collectionData.instagram_username,
          contracts: collectionData.contracts,
          // Add stats data
          floor_price: statsData?.total?.floor_price,
          total_volume: statsData?.total?.volume,
          total_sales: statsData?.total?.sales,
          num_owners: statsData?.total?.num_owners,
          average_price: statsData?.total?.average_price,
          // Interval stats
          one_day_volume: statsData?.intervals?.find(i => i.interval === 'one_day')?.volume,
          seven_day_volume: statsData?.intervals?.find(i => i.interval === 'seven_day')?.volume,
          thirty_day_volume: statsData?.intervals?.find(i => i.interval === 'thirty_day')?.volume,
          one_day_sales: statsData?.intervals?.find(i => i.interval === 'one_day')?.sales,
          seven_day_sales: statsData?.intervals?.find(i => i.interval === 'seven_day')?.sales,
          thirty_day_sales: statsData?.intervals?.find(i => i.interval === 'thirty_day')?.sales
        };
      } else {
        console.log(`❌ Collection not found for slug: ${slug} (${collectionResponse.status} ${collectionResponse.statusText})`);
        return null;
      }
    } catch (error) {
      console.error('Error fetching collection info by slug:', error.message);
      return null;
    }
  }

  async getFloorPrice(contractAddress, chainName, collectionSlug = null) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching floor price for ${contractAddress} on ${chainName}...`);
      
      // Strategy 1: If we have collection slug, use it directly
      if (collectionSlug) {
        console.log(`🔍 Strategy 1: Using collection slug: ${collectionSlug}`);
        const collectionInfo = await this.getCollectionInfoBySlug(collectionSlug, chainName);
        
        if (collectionInfo && collectionInfo.floor_price) {
          console.log(`✅ Found floor price from collection slug: ${collectionInfo.floor_price} ETH`);
          return collectionInfo.floor_price;
        }
      }
      
      // Strategy 2: Get collection info (which now includes floor price from slug approach)
      console.log(`🔍 Strategy 2: Getting collection info with floor price...`);
      const collectionInfo = await this.getCollectionInfo(contractAddress, chainName);
      
      if (collectionInfo && collectionInfo.floor_price) {
        console.log(`✅ Found floor price from collection info: ${collectionInfo.floor_price} ETH`);
        return collectionInfo.floor_price;
      }
      
      // Strategy 3: Try OpenSea API v1 as fallback
      console.log(`🔍 Strategy 3: Trying OpenSea API v1 stats...`);
      const v1Response = await fetch(`https://api.opensea.io/api/v1/collection/${contractAddress}/stats?chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (v1Response.ok) {
        const v1Data = await v1Response.json();
        if (v1Data.stats && v1Data.stats.floor_price) {
          console.log(`✅ OpenSea API v1: Found floor price for ${contractAddress}: ${v1Data.stats.floor_price} ETH`);
          return v1Data.stats.floor_price;
        }
      }
      
      // Strategy 4: Try to estimate floor price from recent sales
      console.log(`🔍 Strategy 4: Trying to estimate floor price from recent sales...`);
      const estimatedFloor = await this.getEstimatedFloorPrice(contractAddress, chainName);
      if (estimatedFloor) {
        return estimatedFloor;
      }
      
      console.log(`❌ No floor price found for ${contractAddress} after trying all strategies`);
      return '-';
    } catch (error) {
      console.error('Error fetching floor price:', error.message);
      console.log(`❌ No floor price found for ${contractAddress}, using dash`);
      return '-';
    }
  }

  async getCollectionStats(contractAddress, chainName) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // First, get collection info to find the slug
      const collectionInfo = await this.getCollectionInfo(contractAddress, chainName);
      
      if (collectionInfo && collectionInfo.slug) {
        console.log(`🔍 Fetching stats using slug: ${collectionInfo.slug}`);
        
        // Try OpenSea API v2 stats endpoint
        const chainMap = {
          'Ethereum': 'ethereum',
          'Base': 'base',
          'Polygon': 'polygon',
          'Arbitrum': 'arbitrum',
          'Optimism': 'optimism',
          'BSC': 'bsc',
          'Berachain': 'berachain',
          'Abstract': 'abstract'
        };
        
        const chain = chainMap[chainName] || 'ethereum';
        
        const v2StatsResponse = await fetch(`https://api.opensea.io/api/v2/collections/${collectionInfo.slug}/stats?chain=${chain}`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (v2StatsResponse.ok) {
          const v2StatsData = await v2StatsResponse.json();
          console.log(`✅ OpenSea API v2: Found collection stats for ${collectionInfo.slug}`);
          
          // OpenSea API v2 has different structure
          const stats = {
            floor_price: v2StatsData.total?.floor_price,
            total_volume: v2StatsData.total?.volume,
            total_sales: v2StatsData.total?.sales,
            num_owners: v2StatsData.total?.num_owners,
            average_price: v2StatsData.total?.average_price,
            market_cap: v2StatsData.total?.market_cap,
            // Volume data from intervals
            one_day_volume: v2StatsData.intervals?.find(i => i.interval === 'one_day')?.volume,
            seven_day_volume: v2StatsData.intervals?.find(i => i.interval === 'seven_day')?.volume,
            thirty_day_volume: v2StatsData.intervals?.find(i => i.interval === 'thirty_day')?.volume,
            // Sales data from intervals
            one_day_sales: v2StatsData.intervals?.find(i => i.interval === 'one_day')?.sales,
            seven_day_sales: v2StatsData.intervals?.find(i => i.interval === 'seven_day')?.sales,
            thirty_day_sales: v2StatsData.intervals?.find(i => i.interval === 'thirty_day')?.sales,
            // Volume change data from intervals
            one_day_volume_change: v2StatsData.intervals?.find(i => i.interval === 'one_day')?.volume_change,
            seven_day_volume_change: v2StatsData.intervals?.find(i => i.interval === 'seven_day')?.volume_change,
            thirty_day_volume_change: v2StatsData.intervals?.find(i => i.interval === 'thirty_day')?.volume_change,
            // Volume diff data from intervals
            one_day_volume_diff: v2StatsData.intervals?.find(i => i.interval === 'one_day')?.volume_diff,
            seven_day_volume_diff: v2StatsData.intervals?.find(i => i.interval === 'seven_day')?.volume_diff,
            thirty_day_volume_diff: v2StatsData.intervals?.find(i => i.interval === 'thirty_day')?.volume_diff
          };
          
          // Calculate floor price changes if we have historical data
          const floorPriceChanges = await this.calculateFloorPriceChanges(contractAddress, chainName, stats.floor_price);
          if (floorPriceChanges) {
            stats.floor_price_change_24h = floorPriceChanges.change24h;
            stats.floor_price_change_7d = floorPriceChanges.change7d;
            stats.floor_price_change_30d = floorPriceChanges.change30d;
          }
          
          return stats;
        } else {
          console.log(`❌ v2 stats API failed: ${v2StatsResponse.status} ${v2StatsResponse.statusText}`);
        }
      }
      
      // Fallback to OpenSea API v1
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      const v1Response = await fetch(`https://api.opensea.io/api/v1/collection/${contractAddress}/stats?chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (v1Response.ok) {
        const v1Data = await v1Response.json();
        if (v1Data.stats) {
          console.log(`✅ OpenSea API v1: Found collection stats for ${contractAddress}`);
          return v1Data.stats;
        }
      }
      
      console.log(`❌ No collection stats found for ${contractAddress}`);
      return null;
    } catch (error) {
      console.error('Error fetching collection stats:', error.message);
      return null;
    }
  }

  async getCollectionInfo(contractAddress, chainName) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching collection info for ${contractAddress} on ${chainName}...`);
      
      // Strategy 1: Try OpenSea API v1 first (more reliable for Base chain)
      console.log(`🔍 Strategy 1: Trying OpenSea API v1...`);
      const v1Response = await fetch(`https://api.opensea.io/api/v1/collection/${contractAddress}?chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (v1Response.ok) {
        const v1Data = await v1Response.json();
        if (v1Data.collection) {
          console.log(`✅ OpenSea API v1: Found collection info for ${contractAddress}`);
          console.log(`📊 Collection name: ${v1Data.collection.name}`);
          console.log(`🔗 Twitter: ${v1Data.collection.twitter_username || 'N/A'}`);
          console.log(`📱 Discord: ${v1Data.collection.discord_url || 'N/A'}`);
          return v1Data.collection;
        }
      }
      
      // Strategy 2: Get collection name from NFT metadata and fetch data using slug
      console.log(`🔍 Strategy 2: Getting collection data using slug approach...`);
      try {
        // First, get collection name from NFT metadata
        const nftResponse = await fetch(`https://api.opensea.io/api/v2/chain/${chain}/contract/${contractAddress}/nfts/1`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (nftResponse.ok) {
          const nftData = await nftResponse.json();
          if (nftData.nfts && nftData.nfts.length > 0) {
            const nft = nftData.nfts[0];
            const collectionName = nft.collection || nft.name || 'Unknown';
            
            console.log(`🔍 Collection name from NFT: ${collectionName}`);
            
            // Generate possible slugs
            const possibleSlugs = this.generatePossibleSlugs(collectionName);
            console.log(`🔍 Generated possible slugs: ${possibleSlugs.join(', ')}`);
            
            // Test each slug and fetch complete data
            for (const slug of possibleSlugs) {
              try {
                console.log(`🔍 Testing slug: ${slug}`);
                
                // Add delay to avoid rate limiting
                await this.sleep(100);
                
                // Fetch collection info using slug
                const collectionResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}`, {
                  headers: {
                    'X-API-KEY': apiKey,
                    'Accept': 'application/json'
                  }
                });
                
                if (collectionResponse.ok) {
                  const collectionData = await collectionResponse.json();
                  
                  // Check if this collection has our contract address
                  const hasContract = collectionData.contracts?.some(contract => 
                    contract.address.toLowerCase() === contractAddress.toLowerCase()
                  );
                  
                  if (hasContract) {
                    console.log(`✅ Found matching collection with slug: ${slug}`);
                    console.log(`📊 Collection name: ${collectionData.name || slug}`);
                    console.log(`🔗 Twitter: ${collectionData.twitter_username || 'N/A'}`);
                    console.log(`📱 Discord: ${collectionData.discord_url || 'N/A'}`);
                    console.log(`🌐 Website: ${collectionData.project_url || 'N/A'}`);
                    
                    // Add delay before fetching stats to avoid rate limiting
                    await this.sleep(200);
                    
                    // Fetch collection stats using the same slug
                    console.log(`🔍 Fetching stats for slug: ${slug}`);
                    const statsResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}/stats?chain=${chain}`, {
                      headers: {
                        'X-API-KEY': apiKey,
                        'Accept': 'application/json'
                      }
                    });
                    
                    let statsData = null;
                    if (statsResponse.ok) {
                      statsData = await statsResponse.json();
                      console.log(`✅ Stats found - Floor: ${statsData.total?.floor_price || 'N/A'} ETH, Volume: ${statsData.total?.volume || 'N/A'} ETH`);
                    } else if (statsResponse.status === 429) {
                      console.log(`⚠️ Rate limited on stats API, skipping stats for now`);
                    } else {
                      console.log(`⚠️ Stats not available: ${statsResponse.status} ${statsResponse.statusText}`);
                    }
                    
                    return {
                      name: collectionData.name || slug,
                      slug: slug,
                      twitter_username: collectionData.twitter_username,
                      discord_url: collectionData.discord_url,
                      external_url: collectionData.project_url || collectionData.external_url,
                      image_url: collectionData.image_url,
                      description: collectionData.description,
                      opensea_url: collectionData.opensea_url || `https://opensea.io/collection/${slug}`,
                      project_url: collectionData.project_url,
                      banner_image_url: collectionData.banner_image_url,
                      owner: collectionData.owner,
                      safelist_status: collectionData.safelist_status,
                      category: collectionData.category,
                      is_disabled: collectionData.is_disabled,
                      is_nsfw: collectionData.is_nsfw,
                      trait_offers_enabled: collectionData.trait_offers_enabled,
                      collection_offers_enabled: collectionData.collection_offers_enabled,
                      wiki_url: collectionData.wiki_url,
                      telegram_url: collectionData.telegram_url,
                      instagram_username: collectionData.instagram_username,
                      contracts: collectionData.contracts,
                      // Add stats data
                      floor_price: statsData?.total?.floor_price,
                      total_volume: statsData?.total?.volume,
                      total_sales: statsData?.total?.sales,
                      num_owners: statsData?.total?.num_owners,
                      average_price: statsData?.total?.average_price,
                      // Interval stats
                      one_day_volume: statsData?.intervals?.find(i => i.interval === 'one_day')?.volume,
                      seven_day_volume: statsData?.intervals?.find(i => i.interval === 'seven_day')?.volume,
                      thirty_day_volume: statsData?.intervals?.find(i => i.interval === 'thirty_day')?.volume,
                      one_day_sales: statsData?.intervals?.find(i => i.interval === 'one_day')?.sales,
                      seven_day_sales: statsData?.intervals?.find(i => i.interval === 'seven_day')?.sales,
                      thirty_day_sales: statsData?.intervals?.find(i => i.interval === 'thirty_day')?.sales
                    };
                  }
                } else if (collectionResponse.status === 429) {
                  console.log(`⚠️ Rate limited on collection API for slug ${slug}, trying next slug...`);
                  await this.sleep(500); // Longer delay for rate limiting
                  continue;
                }
              } catch (error) {
                console.log(`⚠️ Slug test failed for ${slug}: ${error.message}`);
                continue;
              }
            }
            
            console.log(`⚠️ No matching collection found for any generated slug`);
          } else {
            console.log(`⚠️ No NFT data found for contract ${contractAddress}`);
          }
        } else {
          console.log(`⚠️ NFT metadata API failed: ${nftResponse.status} ${nftResponse.statusText}`);
        }
      } catch (error) {
        console.log(`⚠️ NFT metadata strategy failed: ${error.message}`);
      }
      
      // Strategy 3: Try OpenSea API v2 with contract address (only if previous strategies failed)
      console.log(`🔍 Strategy 3: Trying OpenSea API v2 with contract address...`);
      try {
        const v2Response = await fetch(`https://api.opensea.io/api/v2/collections/${contractAddress}?chain=${chain}`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (v2Response.ok) {
          const v2Data = await v2Response.json();
          
          let collectionData = v2Data;
          
          // Try different possible structures
          if (v2Data.collections && v2Data.collections.length > 0) {
            collectionData = v2Data.collections[0];
          } else if (v2Data.nft) {
            collectionData = v2Data.nft;
          } else if (v2Data.collection) {
            collectionData = v2Data;
          }
          
          const collectionName = collectionData.name || collectionData.collection || 'Unknown Collection';
          
          // Check if we got meaningful data (not just contract address as name)
          const hasMeaningfulData = collectionName && 
            collectionName !== contractAddress && 
            (collectionData.twitter_username || collectionData.discord_url || collectionData.project_url);
          
          if (hasMeaningfulData) {
            console.log(`✅ OpenSea API v2: Found meaningful collection info for ${contractAddress}`);
            console.log(`📊 Collection name: ${collectionName}`);
            console.log(`🔗 Twitter: ${collectionData.twitter_username || 'N/A'}`);
            console.log(`📱 Discord: ${collectionData.discord_url || 'N/A'}`);
            
            return {
              name: collectionName,
              slug: collectionData.collection || collectionData.slug || contractAddress,
              twitter_username: collectionData.twitter_username,
              discord_url: collectionData.discord_url,
              external_url: collectionData.project_url || collectionData.external_url,
              image_url: collectionData.image_url,
              description: collectionData.description,
              opensea_url: collectionData.opensea_url || `https://opensea.io/collection/${collectionData.collection || contractAddress}`,
              project_url: collectionData.project_url,
              banner_image_url: collectionData.banner_image_url,
              owner: collectionData.owner,
              safelist_status: collectionData.safelist_status,
              category: collectionData.category,
              is_disabled: collectionData.is_disabled,
              is_nsfw: collectionData.is_nsfw,
              trait_offers_enabled: collectionData.trait_offers_enabled,
              collection_offers_enabled: collectionData.collection_offers_enabled,
              wiki_url: collectionData.wiki_url,
              telegram_url: collectionData.telegram_url,
              instagram_username: collectionData.instagram_username,
              contracts: collectionData.contracts
            };
          } else {
            console.log(`⚠️ OpenSea API v2 returned minimal data (contract as name), continuing to next strategy...`);
          }
        }
      } catch (error) {
        console.log(`⚠️ OpenSea API v2 strategy failed: ${error.message}`);
      }
      
      // Strategy 4: For Base chain, try to find collection by searching all collections
      if (chainName === 'Base') {
        console.log(`🔍 Strategy 4: Searching all Base collections for contract ${contractAddress}...`);
        
        // Try different search strategies
        const searchStrategies = [
          // Search by contract address
          `https://api.opensea.io/api/v2/collections?chain=${chain}&limit=100`,
          // Search with different parameters
          `https://api.opensea.io/api/v2/collections?chain=${chain}&limit=200`,
          // Try without limit
          `https://api.opensea.io/api/v2/collections?chain=${chain}`
        ];
        
        for (const searchUrl of searchStrategies) {
          try {
            const searchResponse = await fetch(searchUrl, {
              headers: {
                'X-API-KEY': apiKey,
                'Accept': 'application/json'
              }
            });
            
            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              const collection = searchData.collections?.find(col => 
                col.contracts?.some(contract => contract.address.toLowerCase() === contractAddress.toLowerCase())
              );
              
              if (collection) {
                console.log(`🔍 Found collection slug: ${collection.collection} for contract ${contractAddress}`);
                
                // Now fetch detailed info using the slug
                const detailedResponse = await fetch(`https://api.opensea.io/api/v2/collections/${collection.collection}?chain=${chain}`, {
                  headers: {
                    'X-API-KEY': apiKey,
                    'Accept': 'application/json'
                  }
                });
                
                if (detailedResponse.ok) {
                  const detailedData = await detailedResponse.json();
                  console.log(`✅ Found detailed collection info via slug search`);
                  
                  const collectionName = detailedData.name || collection.collection || 'Unknown Collection';
                  console.log(`📊 Collection name: ${collectionName}`);
                  console.log(`🔗 Twitter: ${detailedData.twitter_username || 'N/A'}`);
                  console.log(`📱 Discord: ${detailedData.discord_url || 'N/A'}`);
                  
                  return {
                    name: collectionName,
                    slug: collection.collection,
                    twitter_username: detailedData.twitter_username,
                    discord_url: detailedData.discord_url,
                    external_url: detailedData.project_url || detailedData.external_url,
                    image_url: detailedData.image_url,
                    description: detailedData.description,
                    opensea_url: detailedData.opensea_url || `https://opensea.io/collection/${collection.collection}`,
                    project_url: detailedData.project_url,
                    banner_image_url: detailedData.banner_image_url,
                    owner: detailedData.owner,
                    safelist_status: detailedData.safelist_status,
                    category: detailedData.category,
                    is_disabled: detailedData.is_disabled,
                    is_nsfw: detailedData.is_nsfw,
                    trait_offers_enabled: detailedData.trait_offers_enabled,
                    collection_offers_enabled: detailedData.collection_offers_enabled,
                    wiki_url: detailedData.wiki_url,
                    telegram_url: detailedData.telegram_url,
                    instagram_username: detailedData.instagram_username,
                    contracts: detailedData.contracts
                  };
                }
              }
            }
          } catch (error) {
            console.log(`⚠️ Search strategy failed: ${error.message}`);
            continue;
          }
        }
      }
      
      // Strategy 5: Try to get basic info from NFT metadata
      console.log(`🔍 Strategy 5: Trying to get basic info from NFT metadata...`);
      try {
        const nftResponse = await fetch(`https://api.opensea.io/api/v2/chain/${chain}/contract/${contractAddress}/nfts/1`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (nftResponse.ok) {
          const nftData = await nftResponse.json();
          if (nftData.nfts && nftData.nfts.length > 0) {
            const nft = nftData.nfts[0];
            console.log(`✅ Found basic collection info from NFT metadata`);
            
            return {
              name: nft.collection || 'Unknown Collection',
              slug: nft.collection || contractAddress,
              twitter_username: null,
              discord_url: null,
              external_url: null,
              image_url: nft.image_url,
              description: nft.description,
              opensea_url: `https://opensea.io/collection/${nft.collection || contractAddress}`,
              project_url: null,
              banner_image_url: null,
              owner: null,
              safelist_status: null,
              category: null,
              is_disabled: false,
              is_nsfw: false,
              trait_offers_enabled: false,
              collection_offers_enabled: false,
              wiki_url: null,
              telegram_url: null,
              instagram_username: null,
              contracts: [{ address: contractAddress, chain: chain }]
            };
          }
        }
      } catch (error) {
        console.log(`⚠️ NFT metadata strategy failed: ${error.message}`);
      }
      
      // Strategy 5: Try to generate possible slugs from collection name and test them
      console.log(`🔍 Strategy 5: Trying to generate possible slugs...`);
      try {
        // First, try to get collection name from NFT metadata
        const nftResponse = await fetch(`https://api.opensea.io/api/v2/chain/${chain}/contract/${contractAddress}/nfts/1`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (nftResponse.ok) {
          const nftData = await nftResponse.json();
          if (nftData.nfts && nftData.nfts.length > 0) {
            const nft = nftData.nfts[0];
            const collectionName = nft.collection || nft.name || 'Unknown';
            
            console.log(`🔍 Collection name from NFT: ${collectionName}`);
            
            // Generate possible slugs
            const possibleSlugs = this.generatePossibleSlugs(collectionName);
            console.log(`🔍 Generated possible slugs: ${possibleSlugs.join(', ')}`);
            
            // Test each slug
            for (const slug of possibleSlugs) {
              try {
                console.log(`🔍 Testing slug: ${slug}`);
                const slugResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}`, {
                  headers: {
                    'X-API-KEY': apiKey,
                    'Accept': 'application/json'
                  }
                });
                
                if (slugResponse.ok) {
                  const slugData = await slugResponse.json();
                  
                  // Check if this collection has our contract address
                  const hasContract = slugData.contracts?.some(contract => 
                    contract.address.toLowerCase() === contractAddress.toLowerCase()
                  );
                  
                  if (hasContract) {
                    console.log(`✅ Found matching collection with slug: ${slug}`);
                    console.log(`📊 Collection name: ${slugData.name || slug}`);
                    console.log(`🔗 Twitter: ${slugData.twitter_username || 'N/A'}`);
                    console.log(`📱 Discord: ${slugData.discord_url || 'N/A'}`);
                    
                    return {
                      name: slugData.name || slug,
                      slug: slug,
                      twitter_username: slugData.twitter_username,
                      discord_url: slugData.discord_url,
                      external_url: slugData.project_url || slugData.external_url,
                      image_url: slugData.image_url,
                      description: slugData.description,
                      opensea_url: slugData.opensea_url || `https://opensea.io/collection/${slug}`,
                      project_url: slugData.project_url,
                      banner_image_url: slugData.banner_image_url,
                      owner: slugData.owner,
                      safelist_status: slugData.safelist_status,
                      category: slugData.category,
                      is_disabled: slugData.is_disabled,
                      is_nsfw: slugData.is_nsfw,
                      trait_offers_enabled: slugData.trait_offers_enabled,
                      collection_offers_enabled: slugData.collection_offers_enabled,
                      wiki_url: slugData.wiki_url,
                      telegram_url: slugData.telegram_url,
                      instagram_username: slugData.instagram_username,
                      contracts: slugData.contracts
                    };
                  }
                }
              } catch (error) {
                console.log(`⚠️ Slug test failed for ${slug}: ${error.message}`);
                continue;
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Slug generation strategy failed: ${error.message}`);
      }
      

      
      console.log(`❌ No collection info found for ${contractAddress} after trying all strategies`);
      return null;
    } catch (error) {
      console.error('Error fetching collection info:', error.message);
      return null;
    }
  }

  async checkWalletActivity(walletAddress, walletInfo) {
    try {
      const apiKey = config.opensea.apiKey;
      const lastEventTimestamp = walletInfo.lastEventTimestamp;
      
      console.log(`🔍 Checking ${walletInfo.name} activity on OpenSea (since: ${new Date(lastEventTimestamp * 1000).toISOString()})`);
      
      // Požadovat pouze sale a mint eventy
      const response = await fetch(`https://api.opensea.io/api/v2/events/accounts/${walletAddress}?event_type=sale&event_type=mint&limit=20`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Found ${data.asset_events?.length || 0} sale/mint events for ${walletInfo.name}`);
        
        if (data.asset_events && data.asset_events.length > 0) {
          // Seřadit events podle timestamp (nejstarší první)
          const sortedEvents = data.asset_events.sort((a, b) => {
            const timestampA = typeof a.event_timestamp === 'number' ? a.event_timestamp : new Date(a.event_timestamp).getTime() / 1000;
            const timestampB = typeof b.event_timestamp === 'number' ? b.event_timestamp : new Date(b.event_timestamp).getTime() / 1000;
            return timestampA - timestampB;
          });
          
          // Filtrovat pouze nové eventy (s větším timestampem než poslední zpracovaný)
          const newEvents = sortedEvents.filter(event => {
            const eventTimestamp = typeof event.event_timestamp === 'number' ? event.event_timestamp : new Date(event.event_timestamp).getTime() / 1000;
            return eventTimestamp > lastEventTimestamp;
          });
          
          console.log(`📅 Found ${newEvents.length} new events to process (filtered from ${sortedEvents.length} total)`);
          
          if (newEvents.length > 0) {
          console.log(`📅 Processing ${newEvents.length} new events in chronological order...`);

          // Group events by transaction hash to detect sweeps across multiple per-item events
          const groupsByTx = new Map();
          for (const ev of newEvents) {
            const key = typeof ev.transaction === 'string' && ev.transaction.length > 0
              ? ev.transaction
              : `${ev.event_type}-${ev.nft?.contract}-${ev.nft?.identifier}-${ev.event_timestamp}`;
            if (!groupsByTx.has(key)) groupsByTx.set(key, []);
            groupsByTx.get(key).push(ev);
          }

          for (const [txHash, group] of groupsByTx.entries()) {
            if (group.length >= 2) {
              // Build synthetic bulk event from the group
              const base = group[0];
              const isMintGroup = group.every(e => e.event_type === 'mint');

              // Aggregate items and price
              const nfts = group
                .map(e => e.nft)
                .filter(Boolean)
                .map(n => ({
                  contract: n.contract,
                  identifier: n.identifier,
                  name: n.name,
                  image_url: n.image_url,
                  collection: n.collection
                }));

              let totalQty = 0;
              let totalPaid = 0;
              let decimals = 18;
              for (const e of group) {
                const q = typeof e.quantity === 'number' ? e.quantity : 1;
                totalQty += q;
                if (e.payment && e.payment.quantity) {
                  decimals = e.payment.decimals || decimals;
                  const paid = parseFloat(e.payment.quantity) / Math.pow(10, e.payment.decimals || 18);
                  totalPaid += paid;
                }
              }

              const syntheticEvent = {
                event_type: isMintGroup ? 'mint' : 'sale',
                chain: base.chain,
                quantity: totalQty,
                nfts,
                transaction: txHash,
                buyer: base.buyer,
                seller: base.seller,
                payment: totalPaid > 0 ? { quantity: String(totalPaid * Math.pow(10, decimals)), decimals, symbol: base.payment?.symbol } : null,
                event_timestamp: group.reduce((maxTs, e) => {
                  const ts = typeof e.event_timestamp === 'number' ? e.event_timestamp : new Date(e.event_timestamp).getTime() / 1000;
                  return Math.max(maxTs, ts);
                }, 0)
              };

              console.log(`\n🔗 Grouped ${group.length} events into bulk tx ${txHash} (qty=${totalQty}, paid≈${totalPaid})`);
              if (isMintGroup) {
                await this.handleBulkMintEvent(syntheticEvent, walletInfo);
              } else {
                await this.handleBulkEvent(syntheticEvent, walletInfo);
              }

              // Update last processed timestamp from group
              walletInfo.lastEventTimestamp = Math.max(
                walletInfo.lastEventTimestamp,
                syntheticEvent.event_timestamp
              );
            } else {
              const event = group[0];
              // Log single
              console.log(`\n--- Event ---`);
              console.log(`Type: ${event.event_type}`);
              console.log(`Seller: ${event.seller || event.from_address || 'Unknown'}`);
              console.log(`Buyer: ${event.buyer || event.to_address || 'Unknown'}`);
              console.log(`NFT: ${event.nft?.name || 'Unknown'} (${event.nft?.contract || 'Unknown'}) #${event.nft?.identifier || 'Unknown'}`);
              console.log(`Collection: ${event.nft?.collection || 'Unknown'}`);
              console.log(`Timestamp: ${new Date(event.event_timestamp * 1000).toISOString()}`);

              await this.processOpenSeaEvent(event, walletInfo);

              const eventTimestamp = typeof event.event_timestamp === 'number' ? event.event_timestamp : new Date(event.event_timestamp).getTime() / 1000;
              walletInfo.lastEventTimestamp = Math.max(walletInfo.lastEventTimestamp, eventTimestamp);
            }
          }
          } else {
            console.log(`✅ No new events to process for ${walletInfo.name}`);
          }
        }
      } else {
        console.log(`❌ Error fetching wallet activity: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.error(`Error checking wallet activity for ${walletInfo.name}:`, error.message);
    }
  }

  async processOpenSeaEvent(event, walletInfo) {
    try {
      const eventType = event.event_type;
      const nft = event.nft;
      const payment = event.payment;
      const txHashForDedup = event?.transaction;

      console.log(`🔍 Processing event: ${eventType} for ${walletInfo.name}`);
      console.log(`   NFT: ${nft?.name || 'Unknown'}`);
      console.log(`   Contract: ${nft?.contract || 'Unknown'}`);
      console.log(`   Token ID: ${nft?.identifier || 'Unknown'}`);

      // Zpracovávej pouze sale a mint
      if (eventType !== 'sale' && eventType !== 'mint') {
        console.log(`   ❌ Skipping - not a sale or mint event`);
        return;
      }

      // Debug: vypiš všechny adresy
      console.log(`   Debug - Seller: "${event.seller}"`);
      console.log(`   Debug - Buyer: "${event.buyer}"`);
      console.log(`   Debug - To: "${event.to_address}"`);
      const walletAddress = typeof walletInfo?.address === 'string' ? walletInfo.address.toLowerCase() : '';
      console.log(`   Debug - Wallet: "${walletAddress}"`);

      // Bezpečné určení typu s kontrolou undefined
      let isSale = false;
      let isPurchase = false;
      let isMint = false;
      
      try {
        if (eventType === 'sale') {
          // Kontrola prodeje (STPN je seller)
          if (typeof event.seller === 'string' && event.seller.toLowerCase() === walletAddress) {
            isSale = true;
            console.log(`   ✅ Detected SALE: ${walletInfo.name} sold NFT`);
          }
          // Kontrola nákupu (STPN je buyer)
          if (typeof event.buyer === 'string' && event.buyer.toLowerCase() === walletAddress) {
            isPurchase = true;
            console.log(`   ✅ Detected PURCHASE: ${walletInfo.name} bought NFT`);
          }
        }
        if (eventType === 'mint') {
          // Kontrola mint (STPN je recipient)
          if (typeof event.to_address === 'string' && event.to_address.toLowerCase() === walletAddress) {
            isMint = true;
            console.log(`   ✅ Detected MINT: ${walletInfo.name} minted NFT`);
          }
        }
      } catch (error) {
        console.log(`   ❌ Error determining transaction type: ${error.message}`);
        return;
      }
      
      console.log(`   Final: Sale=${isSale}, Purchase=${isPurchase}, Mint=${isMint}`);
      
      if (!isSale && !isPurchase && !isMint) {
        console.log(`   ❌ Skipping - not a relevant transaction for this wallet`);
        return;
      }

      // Deduplicate by transaction hash to prevent multiple messages for the same sweep
      if (typeof txHashForDedup === 'string' && txHashForDedup.length > 0) {
        if (this.processedOpenSeaTxHashes.has(txHashForDedup)) {
          console.log(`   ⚠️ Skipping already processed tx: ${txHashForDedup}`);
          return;
        }
        this.processedOpenSeaTxHashes.add(txHashForDedup);
      }

      // Decide between single vs. bulk transaction handling
      const isBulk = this.isBulkEvent(event);
      console.log(`   Multiplicity check → isBulk=${isBulk}`);
      // Bulk handling for PURCHASE and MINT sweeps
      if (isBulk && isPurchase) {
        await this.handleBulkEvent(event, walletInfo);
        return;
      } else if (isBulk && isMint) {
        await this.handleBulkMintEvent(event, walletInfo);
        return;
      }

      // Get chain name from event
      const chainName = this.getChainFromOpenSeaChain(event.chain);
      console.log(`   Chain: ${chainName}`);

      // Initialize price variables
      let price = 0;
      let priceUSD = 0;
      let nativeSymbol = 'ETH';

      // Pokud máme order hash, zkusíme detailní info
      if (event.order_hash) {
        console.log(`   Order Hash: ${event.order_hash}`);
        const orderDetails = await this.getOrderDetails(event.order_hash, chainName);
        if (orderDetails) {
          price = orderDetails.price;
          priceUSD = orderDetails.priceUSD;
          nativeSymbol = orderDetails.currency;
          console.log(`   Order Price: ${price} ${nativeSymbol}, USD: $${priceUSD}`);
        }
      }

      // Fallback na payment data
      if (price === 0 && payment && payment.quantity) {
        price = parseFloat(payment.quantity) / Math.pow(10, payment.decimals || 18);
        // Calculate USD price using native token price
        const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
        priceUSD = price * nativePriceUSD;
        nativeSymbol = payment.symbol || 'ETH';
        console.log(`   Payment Price: ${price} ${nativeSymbol}, USD: $${priceUSD}`);
      }

      // Special handling for MINT: if still no price, get from chain tx value via *scan proxy
      if (isMint && price === 0 && event.transaction) {
        const txData = await this.getTransactionData(event.transaction, chainName);
        if (txData) {
          price = txData.price || 0;
          priceUSD = txData.priceUSD || 0;
          nativeSymbol = nativeSymbol || this.getNativeTokenSymbol(chainName);
          console.log(`   Mint Price via chain tx: ${price} ${nativeSymbol}, USD: $${priceUSD}`);
        }
      }

      // Normalize wrapped/native symbols for consistent display and logic
      if (typeof nativeSymbol === 'string' && nativeSymbol.toUpperCase() === 'WETH') {
        nativeSymbol = 'ETH';
      }

      if (price === 0) {
        console.log(`   ❌ Skipping - no price information`);
        return;
      }

      // Metadata máme z eventu
      const nftMetadata = {
        image_url: nft.image_url,
        name: nft.name
      };

      // Floor price z OpenSea - použij slug pokud je dostupný
      const floorPrice = await this.getFloorPrice(nft.contract, chainName, nft.collection);

      // Sestavení transactionData
      const transactionData = {
        type: isMint ? 'mint' : (isPurchase ? 'purchase' : 'sale'),
        walletName: walletInfo.name,
        walletAddress: walletInfo.address,
        fromAddress: event.seller || 'Unknown',
        toAddress: event.buyer || event.to_address || 'Unknown',
        tokenName: nft.collection || 'Unknown',
        tokenId: nft.identifier,
        contractAddress: nft.contract,
        transactionHash: event.transaction || 'Unknown',
        chainName: chainName,
        timestamp: typeof event.event_timestamp === 'number'
          ? new Date(event.event_timestamp * 1000)
          : new Date(event.event_timestamp),
        price: price,
        priceUSD: priceUSD,
        quantity: event.quantity || 1,
        imageUrl: nft.image_url,
        nftName: nft.name || `${nft.collection} #${nft.identifier}`,
        nativeSymbol: nativeSymbol,
        floorPrice: floorPrice
      };

      console.log(`   📊 Transaction Data: ${transactionData.type} - ${transactionData.nftName} for ${price} ${nativeSymbol}`);

      // Pro sale: PnL
      if (isSale && this.nftPurchases) {
        // Try to resolve purchase record robustly across potential tokenId formats
        const purchaseKey = this.resolvePurchaseKey(nft.contract, nft.identifier);
        console.log(`   🔍 Looking for purchase data with key: ${purchaseKey}`);
        console.log(`   📊 Available purchase keys:`, Array.from(this.nftPurchases.keys()));
        
        let purchaseData = purchaseKey ? this.nftPurchases.get(purchaseKey) : undefined;
        // Recovery: if we have a record but missing price, try to recover from OpenSea events
        if (purchaseData && (!Number.isFinite(purchaseData.price) || purchaseData.price <= 0)) {
          console.log('   🛠️ Purchase record found but price is 0; attempting recovery...');
          try {
            const recovered = await this.recoverPurchaseData(nft.contract, nft.identifier, walletInfo.address, chainName);
            if (recovered && Number.isFinite(recovered.price) && recovered.price > 0) {
              purchaseData.price = recovered.price;
              purchaseData.priceUSD = recovered.priceUSD || (recovered.price * (await this.getNativeTokenPriceUSD(chainName)));
              if (!purchaseData.timestamp && recovered.timestamp) {
                purchaseData.timestamp = recovered.timestamp;
              }
              // Persist update under both keys
              const originalKey = `${nft.contract}_${nft.identifier}`;
              const stableKey = this.buildStablePurchaseKey(nft.contract, nft.identifier);
              this.nftPurchases.set(originalKey, purchaseData);
              if (stableKey) this.nftPurchases.set(stableKey, purchaseData);
              this.savePurchaseData();
              console.log('   ✅ Recovered missing buy price from events');
            }
          } catch (e) {
            console.log(`   ⚠️ Recovery failed: ${e.message}`);
          }
        }
        if (purchaseData) {
          transactionData.buyPrice = purchaseData.price;
          transactionData.buyPriceUSD = purchaseData.priceUSD;
          transactionData.buyTimestamp = purchaseData.timestamp;
          
          // Calculate hold time
          const holdTimeMs = transactionData.timestamp.getTime() - purchaseData.timestamp;
          const holdTimeMinutes = Math.floor(holdTimeMs / (1000 * 60));
          const holdTimeHours = Math.floor(holdTimeMs / (1000 * 60 * 60));
          const holdTimeDays = Math.floor(holdTimeMs / (1000 * 60 * 60 * 24));
          
          if (holdTimeMinutes < 60) {
            transactionData.holdTime = `${holdTimeMinutes}min`;
          } else if (holdTimeHours < 24) {
            const hours = Math.floor(holdTimeHours);
            const minutes = Math.floor(holdTimeMinutes % 60);
            transactionData.holdTime = `${hours}h ${minutes}min`;
          } else {
            const days = Math.floor(holdTimeDays);
            if (days === 1) {
              transactionData.holdTime = `${days} day`;
            } else {
              transactionData.holdTime = `${days} days`;
            }
          }
          
          // Calculate PnL
          const pnl = price - purchaseData.price;
          const pnlPercent = ((pnl / purchaseData.price) * 100).toFixed(2);
          
          // Store PnL data in transactionData for Discord
          transactionData.pnl = pnl;
          transactionData.pnlPercent = pnlPercent;
          transactionData.buyPrice = purchaseData.price;
          transactionData.buyPriceUSD = purchaseData.priceUSD;
          transactionData.buyTimestamp = purchaseData.timestamp;
          
          console.log(`   💰 PnL data found: bought for ${purchaseData.price} ${nativeSymbol}, sold for ${price} ${nativeSymbol}`);
          console.log(`   📈 PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} ${nativeSymbol} (${pnlPercent}%)`);
          console.log(`   ⏱️ Hold time: ${transactionData.holdTime}`);
          
          // Remove from purchases after sale
          this.nftPurchases.delete(purchaseKey);
          
          // Save updated data to file
          this.savePurchaseData();
        }
      }

      // Pro purchase/mint: uložit pro PnL
      if ((isPurchase || isMint) && this.nftPurchases) {
        // Store under both original and stable keys for compatibility across id formats
        const originalKey = `${nft.contract}_${nft.identifier}`;
        const stableKey = this.buildStablePurchaseKey(nft.contract, nft.identifier);
        const record = {
          price: price,
          priceUSD: priceUSD,
          timestamp: typeof event.event_timestamp === 'number'
            ? event.event_timestamp * 1000 // Store as milliseconds for consistency
            : new Date(event.event_timestamp).getTime(),
          walletAddress: walletInfo.address
        };
        this.nftPurchases.set(originalKey, record);
        if (stableKey && stableKey !== originalKey) {
          this.nftPurchases.set(stableKey, record);
        }
        console.log(`   💾 Stored purchase data for future PnL calculation`);
        
        // Save to file for persistence
        this.savePurchaseData();
      }

      // Odeslat Discord notifikaci
      console.log(`   📤 Sending Discord notification...`);
      console.log(`   📊 Transaction data for Discord:`, JSON.stringify(transactionData, null, 2));
      await this.sendDiscordNotification(transactionData, this);
      console.log(`   ✅ Discord notification sent successfully!`);

    } catch (error) {
      console.error('❌ Error processing OpenSea event:', error.message);
    }
  }

  /**
   * Heuristics to determine if the OpenSea event represents a bulk transaction
   * rather than a single-NFT transaction.
   */
  isBulkEvent(event) {
    try {
      // Quantity field explicitly states how many items were involved
      const quantityNumeric = typeof event?.quantity === 'string'
        ? parseInt(event.quantity, 10)
        : (typeof event?.quantity === 'number' ? event.quantity : 1);
      if (Number.isFinite(quantityNumeric) && quantityNumeric > 1) {
        console.log(`   Bulk detection: quantity=${quantityNumeric} (>1)`);
        return true;
      }

      // Some payloads may include arrays of NFTs/items
      if (Array.isArray(event?.nfts) && event.nfts.length > 1) {
        console.log(`   Bulk detection: nfts array length=${event.nfts.length}`);
        return true;
      }
      if (Array.isArray(event?.items) && event.items.length > 1) {
        console.log(`   Bulk detection: items array length=${event.items.length}`);
        return true;
      }
      if (Array.isArray(event?.assets) && event.assets.length > 1) {
        console.log(`   Bulk detection: assets array length=${event.assets.length}`);
        return true;
      }

      // OpenSea bundle flags in some versions
      if (event?.bundle_type === 'BUNDLE' || event?.is_bundle === true) {
        console.log(`   Bulk detection: bundle flag present`);
        return true;
      }

      return false;
    } catch (error) {
      console.log(`   Bulk detection error: ${error.message}. Assuming single.`);
      return false;
    }
  }

  /**
   * Placeholder for bulk transaction processing (Function B).
   * For now, only logs the detection so we can implement behavior next.
   */
  async handleBulkEvent(event, walletInfo) {
    console.log(`   📦 Bulk transaction detected for ${walletInfo.name}.`);
    const txHash = event?.transaction || 'Unknown';
    const qty = typeof event?.quantity === 'undefined' ? '-' : event.quantity;
    console.log(`   📦 Tx: ${txHash}, Reported quantity: ${qty}`);

    // Derive chain name
    const chainName = this.getChainFromOpenSeaChain(event.chain);

    // Aggregate totals
    const quantity = Number(qty) || (Array.isArray(event?.nfts) ? event.nfts.length : 0) || 0;

    // Try to compute total price
    let totalPrice = 0;
    let nativeSymbol = 'ETH';
    if (event?.payment && event.payment.quantity) {
      totalPrice = parseFloat(event.payment.quantity) / Math.pow(10, event.payment.decimals || 18);
      nativeSymbol = event.payment.symbol || 'ETH';
    }

    // Collection context (use the first NFT as representative)
    const representative = Array.isArray(event?.nfts) && event.nfts.length > 0 ? event.nfts[0] : event.nft;
    const contractAddress = representative?.contract;
    const tokenName = representative?.collection || representative?.name || 'Unknown';

    // Floor price (best-effort, per collection)
    let floorPrice = '-';
    if (contractAddress) {
      floorPrice = await this.getFloorPrice(contractAddress, chainName, tokenName);
    }

    // Compute USD conversions for the lot (optional but useful for PnL)
    let nativeUsd = 0;
    try {
      nativeUsd = await this.getNativeTokenPriceUSD(chainName);
    } catch (e) {
      nativeUsd = 0;
    }
    const totalPriceUSD = nativeUsd && totalPrice ? totalPrice * nativeUsd : undefined;
    const unitPrice = quantity > 0 ? totalPrice / quantity : 0;
    const unitPriceUSD = nativeUsd && unitPrice ? unitPrice * nativeUsd : 0;

    // Persist per-item cost basis for PnL/HODL on later sales
    if (Array.isArray(event?.nfts) && event.nfts.length > 0) {
      for (const item of event.nfts) {
        if (item?.contract && item?.identifier) {
          const purchaseKey = `${item.contract}_${item.identifier}`;
          this.nftPurchases.set(purchaseKey, {
            price: unitPrice,
            priceUSD: unitPriceUSD,
            timestamp: typeof event.event_timestamp === 'number'
              ? event.event_timestamp * 1000
              : new Date(event.event_timestamp || Date.now()).getTime(),
            walletAddress: walletInfo.address
          });
        }
      }
      // Save to disk after batch update
      this.savePurchaseData();
    }

    const transactionData = {
      type: 'purchase',
      isBulk: true,
      walletName: walletInfo.name,
      walletAddress: walletInfo.address,
      tokenName: tokenName,
      tokenId: representative?.identifier, // not used in title for bulk
      contractAddress: contractAddress,
      transactionHash: txHash,
      chainName: chainName,
      timestamp: typeof event.event_timestamp === 'number'
        ? new Date(event.event_timestamp * 1000)
        : new Date(event.event_timestamp || Date.now()),
      totalPrice: totalPrice,
      totalPriceUSD: totalPriceUSD,
      quantity: quantity,
      imageUrl: representative?.image_url,
      nftName: representative?.name,
      nativeSymbol: nativeSymbol,
      floorPrice: floorPrice
    };

    console.log(`   📦 Bulk Transaction Data ready: ${quantity} items, total ${totalPrice} ${nativeSymbol}`);
    await this.sendDiscordNotification(transactionData, this);
  }

  /**
   * Bulk MINT handling (no role ping). Store per-item cost basis and send one embed.
   */
  async handleBulkMintEvent(event, walletInfo) {
    console.log(`   📦 Bulk MINT detected for ${walletInfo.name}.`);
    const txHash = event?.transaction || 'Unknown';
    const chainName = this.getChainFromOpenSeaChain(event.chain);

    const reportedQty = typeof event?.quantity === 'undefined' ? '-' : event.quantity;
    const quantity = Number(reportedQty) || (Array.isArray(event?.nfts) ? event.nfts.length : 0) || 0;

    // Try to get total price from payment; mints may be 0 or have value paid to contract
    let totalPrice = 0;
    let nativeSymbol = this.getNativeTokenSymbol(chainName);
    if (event?.payment && event.payment.quantity) {
      totalPrice = parseFloat(event.payment.quantity) / Math.pow(10, event.payment.decimals || 18);
      nativeSymbol = event.payment.symbol || nativeSymbol;
    }

    // If still 0, try reading tx value from chain
    if (totalPrice === 0 && event.transaction) {
      const txData = await this.getTransactionData(event.transaction, chainName);
      totalPrice = txData?.price || 0;
    }

    const representative = Array.isArray(event?.nfts) && event.nfts.length > 0 ? event.nfts[0] : event.nft;
    const contractAddress = representative?.contract;
    const tokenName = representative?.collection || representative?.name || 'Unknown';

    let floorPrice = '-';
    if (contractAddress) {
      floorPrice = await this.getFloorPrice(contractAddress, chainName, tokenName);
    }

    // USD conversions
    let nativeUsd = 0;
    try {
      nativeUsd = await this.getNativeTokenPriceUSD(chainName);
    } catch (e) {
      nativeUsd = 0;
    }
    const totalPriceUSD = nativeUsd && totalPrice ? totalPrice * nativeUsd : undefined;
    const unitPrice = quantity > 0 ? totalPrice / quantity : 0;
    const unitPriceUSD = nativeUsd && unitPrice ? unitPrice * nativeUsd : 0;

    // Persist per-item cost basis (often 0 for free mints)
    if (Array.isArray(event?.nfts) && event.nfts.length > 0) {
      for (const item of event.nfts) {
        if (item?.contract && item?.identifier) {
          const purchaseKey = `${item.contract}_${item.identifier}`;
          this.nftPurchases.set(purchaseKey, {
            price: unitPrice,
            priceUSD: unitPriceUSD,
            timestamp: typeof event.event_timestamp === 'number'
              ? event.event_timestamp * 1000
              : new Date(event.event_timestamp || Date.now()).getTime(),
            walletAddress: walletInfo.address
          });
        }
      }
      this.savePurchaseData();
    }

    const transactionData = {
      type: 'mint',
      isBulk: true,
      walletName: walletInfo.name,
      walletAddress: walletInfo.address,
      tokenName: tokenName,
      tokenId: representative?.identifier,
      contractAddress: contractAddress,
      transactionHash: txHash,
      chainName: chainName,
      timestamp: typeof event.event_timestamp === 'number'
        ? new Date(event.event_timestamp * 1000)
        : new Date(event.event_timestamp || Date.now()),
      totalPrice: totalPrice,
      totalPriceUSD: totalPriceUSD,
      quantity: quantity,
      imageUrl: representative?.image_url,
      nftName: representative?.name,
      nativeSymbol: nativeSymbol,
      floorPrice: floorPrice
    };

    console.log(`   📦 Bulk Mint Data ready: ${quantity} items, total ${totalPrice} ${nativeSymbol}`);
    await this.sendDiscordNotification(transactionData, this);
  }

  async getOrderDetails(orderHash, chainName) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      // Try different protocols for the order
      const protocols = [
        '0x0000000000000068f116a894984e2db1123eb395', // Seaport
        '0x00000000000001ad428e4906aE43D8F9852d0dD6'  // Seaport 1.4
      ];
      
      for (const protocol of protocols) {
        try {
          const response = await fetch(`https://api.opensea.io/api/v2/orders/chain/${chain}/protocol/${protocol}/order_hash/${orderHash}`, {
            method: 'GET',
            headers: {
              'X-API-KEY': apiKey,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.order && data.order.price && data.order.price.current) {
              const price = data.order.price.current;
              const priceValue = parseFloat(price.value) / Math.pow(10, price.decimals);
              const currency = price.currency;
              
              // Calculate USD price using native token price
              const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
              const priceUSD = priceValue * nativePriceUSD;
              
              return {
                price: priceValue,
                priceUSD: priceUSD,
                currency: currency
              };
            }
          }
        } catch (error) {
          // Continue to next protocol
          continue;
        }
      }
      
      console.log(`❌ No order details found for ${orderHash} on ${chainName}`);
      return null;
      
    } catch (error) {
      console.error('Error fetching order details:', error.message);
      return null;
    }
  }

  getChainFromOpenSeaChain(chain) {
    const chainMap = {
      'ethereum': 'Ethereum',
      'base': 'Base',
      'polygon': 'Polygon',
      'arbitrum': 'Arbitrum',
      'optimism': 'Optimism',
      'bsc': 'BSC',
      'avalanche': 'Avalanche',
      'berachain': 'Berachain',
      'abstract': 'Abstract'
    };
    
    return chainMap[chain] || 'Ethereum';
  }

  async getEstimatedFloorPrice(contractAddress, chainName) {
    try {
      // Try to get estimated floor price from recent sales using OpenSea API v2
      const apiKey = config.opensea.apiKey;
      
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      // Use OpenSea API v2 events endpoint for Base chain - try different endpoint
      const response = await fetch(`https://api.opensea.io/api/v2/events/accounts/${contractAddress}?event_type=sale&limit=10&chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      console.log(`🔍 Floor price API response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📊 Floor price API response:`, JSON.stringify(data, null, 2));
        
        if (data.asset_events && data.asset_events.length > 0) {
          // Calculate average price from recent sales
          const prices = data.asset_events
            .map(event => {
              if (event.payment && event.payment.quantity) {
                return parseFloat(event.payment.quantity) / Math.pow(10, event.payment.decimals || 18);
              }
              return null;
            })
            .filter(price => price !== null && price > 0);
          
          if (prices.length > 0) {
            const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            console.log(`📊 Estimated floor price from recent sales: ${avgPrice.toFixed(6)} ETH`);
            return avgPrice;
          }
        }
      }
      

      
      console.log(`❌ No floor price data available for ${contractAddress} on ${chainName}`);
      return null;
    } catch (error) {
      console.error('Error estimating floor price:', error.message);
      return null;
    }
  }

  /**
   * Recover missing purchase record fields (e.g., price) by querying recent OpenSea sale events
   * where the tracked wallet was the buyer of the given contract/tokenId.
   */
  async recoverPurchaseData(contractAddress, tokenId, walletAddress, chainName) {
    try {
      const apiKey = this.config.opensea.apiKey;
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      const chain = chainMap[chainName] || 'ethereum';
      const url = `https://api.opensea.io/api/v2/events/chain/${chain}/contract/${contractAddress}/nfts/${tokenId}?event_type=sale&limit=10`;
      const res = await fetch(url, { headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const events = Array.isArray(data?.asset_events) ? data.asset_events : [];
      // Find the most recent event where our wallet was buyer
      const mine = events.find(e => typeof e?.buyer === 'string' && e.buyer.toLowerCase() === (walletAddress || '').toLowerCase());
      if (!mine) return null;
      let price = 0;
      if (mine.payment?.quantity) {
        price = parseFloat(mine.payment.quantity) / Math.pow(10, mine.payment.decimals || 18);
      }
      if (!Number.isFinite(price) || price <= 0) return null;
      const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
      const priceUSD = price * nativePriceUSD;
      const ts = typeof mine.event_timestamp === 'number' ? mine.event_timestamp * 1000 : new Date(mine.event_timestamp || Date.now()).getTime();
      return { price, priceUSD, timestamp: ts };
    } catch (e) {
      return null;
    }
  }

  async calculateFloorPriceChanges(contractAddress, chainName, currentFloorPrice) {
    try {
      // For now, we'll use a simple approach to calculate floor price changes
      // In a production environment, you might want to store historical floor prices in a database
      
      if (!currentFloorPrice || currentFloorPrice <= 0) {
        return null;
      }
      
      const apiKey = config.opensea.apiKey;
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      // Get collection info to find the slug
      const collectionInfo = await this.getCollectionInfo(contractAddress, chainName);
      if (!collectionInfo || !collectionInfo.slug) {
        return null;
      }
      
      // For now, we'll use a simplified approach that estimates floor price changes
      // based on volume changes and market activity
      // In a real implementation, you would track historical floor prices over time
      
      console.log(`🔍 Calculating floor price changes for ${collectionInfo.slug}...`);
      
      // This is a placeholder implementation
      // In a production system, you would:
      // 1. Store floor prices in a database with timestamps
      // 2. Query historical floor prices for 24h, 7d, and 30d ago
      // 3. Calculate percentage changes
      
      // For now, return null to indicate no historical data available
      // The Discord notifier will handle this gracefully
      return null;
      
    } catch (error) {
      console.error('Error calculating floor price changes:', error.message);
      return null;
    }
  }

  generatePossibleSlugs(collectionName) {
    if (!collectionName || collectionName === 'Unknown') {
      return [];
    }
    
    const slugs = [];
    
    // Remove special characters and normalize
    let cleanName = collectionName
      .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
      .trim();
    
    console.log(`🔍 Generating slugs for: "${cleanName}"`);
    
    // Strategy 1: Convert to lowercase with hyphens (slova oddělená pomlčkami)
    const slug1 = cleanName
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    if (slug1) {
      slugs.push(slug1);
      console.log(`📝 Strategy 1 (hyphens): "${slug1}"`);
    }
    
    // Strategy 2: Convert to lowercase without spaces (slova dohromady)
    const slug2 = cleanName
      .toLowerCase()
      .replace(/\s+/g, '') // Remove all spaces
      .replace(/-+/g, ''); // Remove hyphens
    
    if (slug2 && slug2 !== slug1) {
      slugs.push(slug2);
      console.log(`📝 Strategy 2 (no spaces): "${slug2}"`);
    }
    
    // Remove duplicates and return
    return [...new Set(slugs)];
  }

  // Fetch historical purchase data for all tracked wallets
  async fetchHistoricalPurchases() {
    console.log('🔍 Fetching historical purchase data...');
    
    for (const [address, walletInfo] of this.trackedWallets) {
      try {
        await this.fetchWalletHistoricalPurchases(address, walletInfo);
        // Add delay to avoid rate limiting
        await this.sleep(500);
      } catch (error) {
        console.error(`❌ Error fetching historical purchases for ${walletInfo.name}:`, error.message);
      }
    }
    
    console.log(`✅ Historical purchase data fetch completed. Total purchases: ${this.nftPurchases.size}`);
  }

  // Fetch historical purchase data for a specific wallet
  async fetchWalletHistoricalPurchases(walletAddress, walletInfo) {
    try {
      const apiKey = config.opensea.apiKey;
      
      console.log(`🔍 Fetching historical purchases for ${walletInfo.name}...`);
      
      // Fetch sale events (purchases) from the last 30 days
      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      
      const response = await fetch(`https://api.opensea.io/api/v2/events/accounts/${walletAddress}?event_type=sale&occurred_after=${thirtyDaysAgo}&limit=50`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.asset_events && data.asset_events.length > 0) {
          console.log(`📥 Found ${data.asset_events.length} sale events for ${walletInfo.name}`);
          
          for (const event of data.asset_events) {
            // Check if this is a purchase (wallet is the buyer)
            if (event.buyer && event.buyer.toLowerCase() === walletAddress.toLowerCase()) {
              const nft = event.nft;
              if (nft && nft.contract && nft.identifier) {
                const purchaseKey = `${nft.contract}_${nft.identifier}`;
                
                // Only add if we don't already have this purchase
                if (!this.nftPurchases.has(purchaseKey)) {
                  // Try to get price from the event
                  let price = 0;
                  let priceUSD = 0;
                  const chainName = this.getChainFromOpenSeaChain(event.chain);
                  
                  if (event.payment && event.payment.quantity) {
                    price = parseFloat(event.payment.quantity) / Math.pow(10, event.payment.decimals || 18);
                    const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
                    priceUSD = price * nativePriceUSD;
                  } else {
                    // Fallbacks when payment is missing
                    try {
                      if (event.order_hash) {
                        const order = await this.getOrderDetails(event.order_hash, chainName);
                        if (order && order.price) {
                          price = order.price;
                          priceUSD = order.priceUSD || 0;
                        }
                      }
                      if (price === 0 && event.transaction) {
                        const tx = await this.getTransactionData(event.transaction, chainName);
                        if (tx && tx.price) {
                          price = tx.price;
                          priceUSD = tx.priceUSD || 0;
                        }
                      }
                    } catch (e) {
                      // ignore fallback failures
                    }
                  }
                  
                  const timestamp = typeof event.event_timestamp === 'number' 
                    ? event.event_timestamp * 1000 
                    : new Date(event.event_timestamp).getTime();
                  
                  this.nftPurchases.set(purchaseKey, {
                    price: price,
                    priceUSD: priceUSD,
                    timestamp: timestamp,
                    walletAddress: walletAddress
                  });
                  
                  console.log(`   💾 Added historical purchase: ${nft.name || nft.identifier} for ${price} ETH`);
                }
              }
            }
          }
        }
      } else {
        console.log(`❌ Error fetching historical purchases for ${walletInfo.name}: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching historical purchases for ${walletInfo.name}:`, error.message);
    }
  }
}

module.exports = NFTTracker; 