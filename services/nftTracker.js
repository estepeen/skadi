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
    this.processedOpenSeaTxs = new Set();
    
    this.isInitialized = false;
    
    // No more purchases.json dependency - we always fetch from OpenSea API
    console.log('✅ NFT Tracker initialized without purchases.json dependency');
  }

  async initialize(wallets) {
    console.log('Initializing NFT Tracker...');
    
    // Get current timestamp in seconds
    const currentTime = Math.floor(Date.now() / 1000);
    
    for (const wallet of wallets) {
      this.trackedWallets.set(wallet.address, {
        address: wallet.address,
        name: wallet.name,
        lastChecked: Date.now(),
        // Start with a small backoff window to avoid missing fresh events due to clock skews
        lastEventTimestamp: currentTime - 300 // 5 min backoff from current time
      });
      console.log(`Tracking wallet: ${wallet.name} (${wallet.address})`);
    }

    // Initialize Discord notifier if configured
    if (config.discord.botToken && config.discord.channelId) {
      try {
        console.log('🔗 Initializing Discord connection...');
        await this.discordNotifier.connect();
        
        // Wait for the bot to be ready
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout
        while (!this.discordNotifier.isReady && attempts < maxAttempts) {
          await this.sleep(1000); // Wait 1 second
          attempts++;
        }
        
        if (this.discordNotifier.isReady) {
          console.log('✅ Discord integration enabled and ready');
        } else {
          throw new Error('Discord bot failed to become ready within timeout');
        }
      } catch (error) {
        console.error('❌ Discord integration failed:', error.message);
        console.log('⚠️ Discord notifications will be disabled for this session');
        this.discordNotifier = null;
      }
    } else {
      console.log('⚠️ Discord integration disabled - missing bot token or channel ID');
    }

    // No need to fetch historical purchases or save data - we'll fetch from OpenSea API in real-time
    console.log('🚀 NFT Tracker ready - will fetch purchase data from OpenSea API when needed');
    
    this.isInitialized = true;
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
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
      };
      
      const chain = chainMap[chainName];
      
      if (!chain) {
        console.log(`⚠️ No OpenSea chain mapping for ${chainName}`);
        return [];
      }
      
      console.log(`🔍 Fetching recent transactions for ${address} on ${chainName} via OpenSea API V2...`);
      
      // Use OpenSea API V2 to get recent events for the wallet
      const response = await fetch(`https://api.opensea.io/api/v2/events/chain/${chain}/account/${address}?event_type=item_transferred&limit=10`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.asset_events && data.asset_events.length > 0) {
          console.log(`✅ Found ${data.asset_events.length} recent events for ${address}`);
          
          // Convert OpenSea events to transaction format
          return data.asset_events.map(event => ({
            hash: event.transaction_hash,
            from: event.seller?.address || event.from_account?.address,
            to: event.buyer?.address || event.to_account?.address,
            contractAddress: event.asset?.asset_contract?.address,
            tokenId: event.asset?.token_id,
            methodId: '0x23b872dd', // ERC-721 transfer
            timestamp: event.event_timestamp,
            price: event.payment?.amount ? Number(event.payment.amount) / Math.pow(10, event.payment.decimals || 18) : 0,
            priceUSD: event.payment?.usd_amount || 0
          }));
        }
      } else {
        console.log(`⚠️ OpenSea API V2 returned status ${response.status}`);
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching recent transactions via OpenSea API V2:', error.message);
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
    
    // Get collection royalties info
    let royaltiesInfo = null;
    try {
      const collectionInfo = await this.getCollectionInfo(tx.contractAddress, chainName);
      if (collectionInfo && collectionInfo.slug) {
        royaltiesInfo = await this.getCollectionRoyalties(collectionInfo.slug, chainName);
      }
    } catch (error) {
      console.log(`⚠️ Could not fetch royalties info: ${error.message}`);
    }
    
    // No need to store purchase data - we'll fetch it from OpenSea API when needed for PnL calculation
    console.log('💾 Purchase data will be fetched from OpenSea API when needed for PnL calculation');
    
    // Prepare transaction data for alerts checking
    const alertTransactionData = {
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
      floorPrice: floorPrice,
      royaltiesInfo: royaltiesInfo
    };

    // Check alerts for this transaction
    const alertsMonitor = this.discordNotifier.getAlertsMonitor();
    if (alertsMonitor) {
      await alertsMonitor.checkTokenAlerts(alertTransactionData);
    }

    // Send Discord notification
    await this.sendDiscordNotification(alertTransactionData);
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
    
    // Get collection royalties info
    let royaltiesInfo = null;
    try {
      const collectionInfo = await this.getCollectionInfo(tx.contractAddress, chainName);
      if (collectionInfo && collectionInfo.slug) {
        royaltiesInfo = await this.getCollectionRoyalties(collectionInfo.slug, chainName);
      }
    } catch (error) {
      console.log(`⚠️ Could not fetch royalties info: ${error.message}`);
    }
    
    // Always search for purchase data via OpenSea API for real-time accuracy
    console.log(`🔍 Searching OpenSea API for purchase data for ${nftMetadata.name || `#${tx.tokenId}`}...`);
    
    let purchaseData = null;
    let pnl = 0;
    let pnlUSD = 0;
    let holdTime = '-';
    
    try {
      // Always search for purchase data via OpenSea API for real-time accuracy
      console.log(`   🔍 Searching OpenSea API for purchase data...`);
      purchaseData = await this.recoverPurchaseData(tx.contractAddress, tx.tokenId, tx.from, chainName);
      
      if (purchaseData && Number.isFinite(purchaseData.price) && purchaseData.price > 0) {
        console.log(`   ✅ Found purchase data via API: ${purchaseData.price} ETH`);
        
        // Calculate PnL if we have purchase data
        if (transactionData.price > 0) {
          pnl = transactionData.price - purchaseData.price;
          pnlUSD = (transactionData.priceUSD || 0) - (purchaseData.priceUSD || 0);
          
          // Calculate hold time
          if (purchaseData.timestamp) {
            const saleTimestamp = new Date().getTime();
            const holdTimeMs = saleTimestamp - purchaseData.timestamp;
            if (holdTimeMs > 0) {
              const holdTimeMinutes = Math.floor(holdTimeMs / (1000 * 60));
              const holdTimeHours = Math.floor(holdTimeMs / (1000 * 60 * 60));
              const holdTimeDays = Math.floor(holdTimeMs / (1000 * 60 * 60 * 24));
              
              if (holdTimeMinutes < 60) {
                holdTime = `${holdTimeMinutes}min`;
              } else if (holdTimeHours < 24) {
                const hours = Math.floor(holdTimeHours);
                const minutes = Math.floor(holdTimeMinutes % 60);
                holdTime = `${hours}h ${minutes}min`;
              } else {
                const days = Math.floor(holdTimeDays);
                if (days === 1) {
                  holdTime = `${days} day`;
                } else {
                  holdTime = `${days} days`;
                }
              }
            }
          }
          
          console.log(`   💰 PnL for ${nftMetadata.name || `#${tx.tokenId}`}: ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} ETH`);
          console.log(`   ⏱️ Hold time: ${holdTime}`);
        }
      } else {
        console.log(`   ❌ No purchase data found for this NFT`);
      }
    } catch (error) {
      console.error(`   ❌ Error finding purchase data:`, error.message);
    }
    
    // Prepare transaction data for alerts checking
    const alertTransactionData = {
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
      buyTimestamp: purchaseData?.timestamp || null,
      pnl: pnl,
      pnlUSD: pnlUSD,
      holdTime: holdTime,
      royaltiesInfo: royaltiesInfo
    };

    // Check alerts for this transaction
    const alertsMonitor = this.discordNotifier.getAlertsMonitor();
    if (alertsMonitor) {
      await alertsMonitor.checkTokenAlerts(alertTransactionData);
    }

    // Send Discord notification
    await this.sendDiscordNotification(alertTransactionData);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendDiscordNotification(transactionData, nftTracker = null) {
    if (!this.discordNotifier) {
      console.log('⚠️ Discord notifier not available, skipping notification');
      return;
    }
    
    try {
      await this.discordNotifier.sendNotification(transactionData, nftTracker);
      console.log('✅ Discord notification sent successfully!');
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
        
        // Wait before next scan
        console.log(`\n⏱️ Waiting ${config.scanInterval / 1000 / 60} minutes before next scan...`);
        await this.sleep(config.scanInterval);
        
      } catch (error) {
        console.error('Error in tracking loop:', error);
        await this.sleep(10000); // Wait 10 seconds on error
      }
    }
  }

  async getMintPriceForNFT(contract, tokenId, chainName) {
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
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
      };
      
      const chain = chainMap[chainName];
      
      if (!chain) {
        console.log(`⚠️ No OpenSea chain mapping for ${chainName}`);
        return { price: 0, priceUSD: 0 };
      }
      
      console.log(`🔍 Fetching mint price for NFT ${contract}/${tokenId} on ${chainName}...`);
      
      // Use OpenSea API V2 Events endpoint for specific NFT with mint filter
      const params = new URLSearchParams();
      params.append('event_type', 'mint');
      params.set('limit', '100'); // Get enough events to find the first mint
      
      const url = `https://api.opensea.io/api/v2/events/chain/${chain}/contract/${contract}/nfts/${tokenId}?${params}`;
      
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.log(`⚠️ OpenSea API V2 returned status ${response.status} for mint events`);
        return { price: 0, priceUSD: 0 };
      }
      
      const json = await response.json();
      const events = Array.isArray(json.events) ? json.events
                   : Array.isArray(json.asset_events) ? json.asset_events
                   : [];
      
      if (events.length === 0) {
        console.log(`⚠️ No mint events found for NFT ${contract}/${tokenId}`);
        return { price: 0, priceUSD: 0 };
      }
      
      // Sort by time (ascending) and take the first mint
      events.sort((a, b) => new Date(a.occurred_at || a.event_timestamp) - new Date(b.occurred_at || b.event_timestamp));
      const evt = events[0];
      
      const parsePayment = (e) => {
        // Method 1: payment.quantity with payment.decimals
        if (e?.payment?.quantity) {
          const dec = Number(e.payment.decimals ?? 18);
          return { 
            native: Number(e.payment.quantity) / (10 ** dec), 
            usd: Number(e.payment.usd_amount ?? 0) 
          };
        }
        
        // Method 2: sale_price with payment_token.decimals
        if (e?.sale_price != null) {
          const dec = Number(e?.payment_token?.decimals ?? 18);
          return { 
            native: Number(e.sale_price) / (10 ** dec), 
            usd: Number(e?.payment?.usd_amount ?? 0) 
          };
        }
        
        // Method 3: price.value with price.currency.decimals
        if (e?.price?.value != null) {
          const dec = Number(e?.price?.currency?.decimals ?? 18);
          const native = Number(e.price.value) / (10 ** dec);
          const usd = (Number(e?.price?.currency?.usd_price ?? 0) || 0) * native;
          return { native, usd };
        }
        
        return { native: 0, usd: 0 };
      };
      
      const price = parsePayment(evt);
      
      if (price.native > 0) {
        console.log(`✅ Found mint price for NFT: ${price.native} ETH ($${price.usd})`);
      } else {
        console.log(`⚠️ Mint event found but no price data (likely free mint)`);
      }
      
      return { 
        price: price.native, 
        priceUSD: price.usd, 
        occurred_at: evt.occurred_at || evt.event_timestamp, 
        tx_hash: evt?.transaction?.hash || null 
      };
      
    } catch (error) {
      console.error('Error getting mint price for NFT:', error.message);
      return { price: 0, priceUSD: 0 };
    }
  }

  async getTransactionData(txHash, chainName) {
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
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
      };
      
      const chain = chainMap[chainName];
      
      if (!chain) {
        console.log(`⚠️ No OpenSea chain mapping for ${chainName}`);
        return {
          price: 0,
          priceUSD: 0,
          gasUsed: 0,
          gasPrice: 0
        };
      }
      
      console.log(`🔍 Fetching transaction data for ${txHash} on ${chainName} via OpenSea API V2...`);
      
      // Try OpenSea API V2 for transaction events
      try {
        const response = await fetch(`https://api.opensea.io/api/v2/events/chain/${chain}/transaction/${txHash}`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const events = Array.isArray(data.events) ? data.events
                       : Array.isArray(data.asset_events) ? data.asset_events
                       : [];
          
          if (events.length > 0) {
            // Find mint, sale, or transfer event
            const targetEvent = events.find(event => 
              event.event_type === 'mint' || 
              event.event_type === 'sale' ||
              event.event_type === 'item_transferred' || 
              event.event_type === 'item_sold'
            );
            
            if (targetEvent) {
              const parsePayment = (e) => {
                // Method 1: payment.quantity with payment.decimals
                if (e?.payment?.quantity) {
                  const dec = Number(e.payment.decimals ?? 18);
                  return { 
                    native: Number(e.payment.quantity) / (10 ** dec), 
                    usd: Number(e.payment.usd_amount ?? 0) 
                  };
                }
                
                // Method 2: sale_price with payment_token.decimals
                if (e?.sale_price != null) {
                  const dec = Number(e?.payment_token?.decimals ?? 18);
                  return { 
                    native: Number(e.sale_price) / (10 ** dec), 
                    usd: Number(e?.payment?.usd_amount ?? 0) 
                  };
                }
                
                // Method 3: price.value with price.currency.decimals
                if (e?.price?.value != null) {
                  const dec = Number(e?.price?.currency?.decimals ?? 18);
                  const native = Number(e.price.value) / (10 ** dec);
                  const usd = (Number(e?.price?.currency?.usd_price ?? 0) || 0) * native;
                  return { native, usd };
                }
                
                return { native: 0, usd: 0 };
              };
              
              const price = parsePayment(targetEvent);
              
              if (price.native > 0) {
                console.log(`✅ Found transaction data via OpenSea API V2: ${price.native} ETH ($${price.usd})`);
                
                return {
                  price: price.native,
                  priceUSD: price.usd,
                  gasUsed: 0,
                  gasPrice: 0
                };
              }
            }
          }
        } else {
          console.log(`⚠️ OpenSea API V2 returned status ${response.status}`);
        }
      } catch (error) {
        console.log(`⚠️ OpenSea API V2 failed: ${error.message}`);
      }
      
      console.log(`❌ No transaction data found via OpenSea API V2`);
      
      // Fallback: return default values
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
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching NFT metadata for ${contractAddress} #${tokenId} on ${chainName}...`);
      
      // Use OpenSea API V2 for better compatibility and future-proofing
      const response = await fetch(`https://api.opensea.io/api/v2/chain/${chain}/contract/${contractAddress}/nfts/${tokenId}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.nfts && data.nfts.length > 0) {
          const nft = data.nfts[0];
          console.log(`✅ OpenSea API V2: Found NFT metadata for ${contractAddress} #${tokenId}`);
          return {
            name: nft.name || `#${tokenId}`,
            image_url: nft.image_url,
            description: nft.description,
            collection: nft.collection,
            attributes: nft.traits || [],
            external_url: nft.external_url,
            animation_url: nft.animation_url,
            background_color: nft.background_color,
            token_id: nft.identifier,
            contract_address: nft.contract
          };
        }
      }
      
      console.log(`❌ No NFT metadata found for ${contractAddress} #${tokenId} on ${chainName}`);
      return null;
      
    } catch (error) {
      console.error('Error fetching NFT metadata:', error.message);
      return null;
    }
  }

  getNativeTokenSymbol(chainName) {
    const symbols = {
      'ethereum': 'ETH',
      'apechain': 'APE',
      'ape_chain': 'APE',
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
        apechain: 'apecoin', // ApeChain uses APE token
        ape_chain: 'apecoin', // ApeChain uses APE token
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
            'apecoin': 'APE',
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
      const apiKey = this.config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
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
        
        // Add delay before fetching royalties to avoid rate limiting
        await this.sleep(200);
        
        // Fetch royalties information
        console.log(`🔍 Fetching royalties info for slug: ${slug}`);
        const royaltiesInfo = await this.getCollectionRoyalties(slug, chainName);
        
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
          thirty_day_sales: statsData?.intervals?.find(i => i.interval === 'thirty_day')?.sales,
          // Add royalties data
          royalties: royaltiesInfo
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

  /**
   * Get collection royalties information from OpenSea API v2
   */
  async getCollectionRoyalties(slug, chainName) {
    try {
      const apiKey = this.config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      // Try to get royalties from collection details endpoint
      const royaltiesResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}&include_hidden=true`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (royaltiesResponse.ok) {
        const royaltiesData = await royaltiesResponse.json();
        
        // Extract royalties information
        const royalties = {
          percentage: null,
          is_enforced: false,
          is_optional: false
        };
        
        // Check for royalties in various possible fields
        if (royaltiesData.royalties && Array.isArray(royaltiesData.royalties)) {
          // Find the highest royalty percentage (including 0%)
          let highestRoyalty = null;
          for (const royalty of royaltiesData.royalties) {
            if (royalty.percentage !== null && royalty.percentage !== undefined) {
              if (highestRoyalty === null || royalty.percentage > highestRoyalty) {
                highestRoyalty = royalty.percentage;
              }
            }
          }
          
                  // Set royalties percentage (even if it's 0%)
        if (highestRoyalty !== null) {
          royalties.percentage = highestRoyalty;
        } else {
          // If no royalties found in API, assume 0% instead of null
          royalties.percentage = 0;
        }
        }
        
        // Alternative: check for royalties in collection stats or other fields
        if (!royalties.percentage && royaltiesData.stats && royaltiesData.stats.royalties) {
          royalties.percentage = royaltiesData.stats.royalties;
        }
        
        // Check for royalties in collection metadata
        if (!royalties.percentage && royaltiesData.metadata && royaltiesData.metadata.royalties) {
          royalties.percentage = royaltiesData.metadata.royalties;
        }
        
        // Check for royalties in collection settings
        if (!royalties.percentage && royaltiesData.settings && royaltiesData.settings.royalties) {
          royalties.percentage = royaltiesData.settings.royalties;
        }
        
        // Try to get royalties from contract data
        if (!royalties.percentage && royaltiesData.contracts && Array.isArray(royaltiesData.contracts)) {
          for (const contract of royaltiesData.contracts) {
            if (contract.royalties && contract.royalties > 0) {
              royalties.percentage = contract.royalties;
              break;
            }
          }
        }
        
        // Check if royalties are enforced (usually indicated by contract-level enforcement)
        if (royaltiesData.contracts && Array.isArray(royaltiesData.contracts)) {
          // Look for any contract that might indicate enforced royalties
          royalties.is_enforced = royaltiesData.contracts.some(contract => 
            contract.royalties_enforced === true || 
            contract.royalties_enforced === 'true' ||
            contract.royalties_enforced === 1
          );
        }
        
        // If not enforced, mark as optional
        if (!royalties.is_enforced) {
          royalties.is_optional = true;
        }
        

        
        console.log(`✅ Royalties info: ${royalties.percentage}% (${royalties.is_enforced ? 'enforced' : 'optional'})`);
        return royalties;
      } else {
        console.log(`⚠️ Could not fetch royalties info: ${royaltiesResponse.status} ${royaltiesResponse.statusText}`);
        return null;
      }
    } catch (error) {
      console.log(`⚠️ Error fetching royalties info: ${error.message}`);
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
        'Abstract': 'abstract',
        'ApeChain': 'ape_chain'
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
      
      // Strategy 2: Try OpenSea API v2 with collection slug
      if (collectionSlug) {
        console.log(`🔍 Strategy 2: Trying OpenSea API v2 with collection slug...`);
        try {
          const v2Response = await fetch(`https://api.opensea.io/api/v2/collections/${collectionSlug}/stats?chain=${chain}`, {
            headers: {
              'X-API-KEY': apiKey,
              'Accept': 'application/json'
            }
          });
          
          if (v2Response.ok) {
            const v2Data = await v2Response.json();
            if (v2Data.total && Number.isFinite(v2Data.total.floor_price) && v2Data.total.floor_price > 0) {
              console.log(`✅ OpenSea API v2: Found floor price for ${collectionSlug}: ${v2Data.total.floor_price} ETH`);
              return v2Data.total.floor_price;
            }
          }
        } catch (error) {
          console.log(`⚠️ OpenSea API v2 strategy failed: ${error.message}`);
        }
      }
      
      // Strategy 3: Try OpenSea API v2 with contract address directly
      console.log(`🔍 Strategy 3: Trying OpenSea API v2 with contract address...`);
      try {
        // First try to get collection info to find the slug
        const collectionInfo = await this.getCollectionInfo(contractAddress, chainName);
        if (collectionInfo && collectionInfo.slug) {
          const v2Response = await fetch(`https://api.opensea.io/api/v2/collections/${collectionInfo.slug}/stats?chain=${chain}`, {
            headers: {
              'X-API-KEY': apiKey,
              'Accept': 'application/json'
            }
          });
          
          if (v2Response.ok) {
            const v2Data = await v2Response.json();
            if (v2Data.total) {
              console.log(`✅ OpenSea API v2: Found collection stats via collection info`);
              return {
                floor_price: v2Data.total.floor_price,
                total_volume: v2Data.total.volume,
                total_sales: v2Data.total.sales,
                num_owners: v2Data.total.num_owners,
                average_price: v2Data.total.average_price,
                // Interval stats
                one_day_volume: v2Data.intervals?.find(i => i.interval === 'one_day')?.volume,
                seven_day_volume: v2Data.intervals?.find(i => i.interval === 'seven_day')?.volume,
                thirty_day_volume: v2Data.intervals?.find(i => i.interval === 'thirty_day')?.volume,
                one_day_sales: v2Data.intervals?.find(i => i.interval === 'one_day')?.sales,
                seven_day_sales: v2Data.intervals?.find(i => i.interval === 'seven_day')?.sales,
                thirty_day_sales: v2Data.intervals?.find(i => i.interval === 'thirty_day')?.sales
              };
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ OpenSea API v2 contract strategy failed: ${error.message}`);
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
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'ApeChain': 'ape_chain',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching collection stats for ${contractAddress} on ${chainName} via OpenSea API V2...`);
      
      // First try to get collection info to find the slug
      const collectionInfo = await this.getCollectionInfo(contractAddress, chainName);
      if (collectionInfo && collectionInfo.slug) {
        console.log(`🔍 Using collection slug: ${collectionInfo.slug}`);
        
        // Use OpenSea API V2 to get collection stats
        const response = await fetch(`https://api.opensea.io/api/v2/collections/${collectionInfo.slug}/stats?chain=${chain}`, {
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.total) {
            console.log(`✅ OpenSea API V2: Found collection stats for ${collectionInfo.slug}`);
            return {
              floor_price: data.total.floor_price,
              total_volume: data.total.volume,
              total_sales: data.total.sales,
              num_owners: data.total.num_owners,
              average_price: data.total.average_price,
              // Interval stats
              one_day_volume: data.intervals?.find(i => i.interval === 'one_day')?.volume,
              seven_day_volume: data.intervals?.find(i => i.interval === 'seven_day')?.volume,
              thirty_day_volume: data.intervals?.find(i => i.interval === 'thirty_day')?.volume,
              one_day_sales: data.intervals?.find(i => i.interval === 'one_day')?.sales,
              seven_day_sales: data.intervals?.find(i => i.interval === 'seven_day')?.sales,
              thirty_day_sales: data.intervals?.find(i => i.interval === 'thirty_day')?.sales
            };
          }
        }
      }
      
      console.log(`❌ No collection stats found for ${contractAddress}`);
      return null;
    } catch (error) {
      console.error('Error fetching collection stats:', error.message);
      return null;
    }
  }

  async getCollectionStatsBySlug(slug, chainName) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'ApeChain': 'ape_chain',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching collection stats by slug: ${slug} on ${chainName} via OpenSea API V2...`);
      
      // Use OpenSea API V2 to get collection stats directly by slug
      const response = await fetch(`https://api.opensea.io/api/v2/collections/${slug}/stats?chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.total) {
          console.log(`✅ OpenSea API V2: Found collection stats for ${slug}`);
          return {
            floor_price: data.total.floor_price,
            total_volume: data.total.volume,
            total_sales: data.total.sales,
            num_owners: data.total.num_owners,
            average_price: data.total.average_price,
            total_supply: data.total.supply,
            // Interval stats
            one_day_volume: data.intervals?.find(i => i.interval === 'one_day')?.volume,
            seven_day_volume: data.intervals?.find(i => i.interval === 'seven_day')?.volume,
            thirty_day_volume: data.intervals?.find(i => i.interval === 'thirty_day')?.volume,
            one_day_sales: data.intervals?.find(i => i.interval === 'one_day')?.sales,
            seven_day_sales: data.intervals?.find(i => i.interval === 'seven_day')?.sales,
            thirty_day_sales: data.intervals?.find(i => i.interval === 'thirty_day')?.sales
          };
        }
      }
      
      console.log(`❌ No collection stats found for slug: ${slug}`);
      return null;
    } catch (error) {
      console.error('Error fetching collection stats by slug:', error.message);
      return null;
    }
  }

  async getCollectionInfo(contractAddress, chainName) {
    try {
      const apiKey = config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'ApeChain': 'ape_chain',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      console.log(`🔍 Fetching collection info for ${contractAddress} on ${chainName} via OpenSea API V2...`);
      
      // Strategy 1: Try OpenSea API V2 with contract address directly
      console.log(`🔍 Strategy 1: Trying OpenSea API V2 with contract address...`);
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
                
                const slugResponse = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}`, {
                  headers: {
                    'X-API-KEY': apiKey,
                    'Accept': 'application/json'
                  }
                });
                
                if (slugResponse.ok) {
                  const slugData = await slugResponse.json();
                  if (slugData.collection) {
                    console.log(`✅ OpenSea API V2: Found collection info for slug: ${slug}`);
                    console.log(`📊 Collection name: ${slugData.collection.name}`);
                    console.log(`🔗 Twitter: ${slugData.collection.twitter_username || 'N/A'}`);
                    console.log(`📱 Discord: ${slugData.collection.discord_url || 'N/A'}`);
                    
                    // Add slug to the collection data for future use
                    slugData.collection.slug = slug;
                    return slugData.collection;
                  }
                }
              } catch (error) {
                console.log(`⚠️ Error testing slug ${slug}: ${error.message}`);
                continue;
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ OpenSea API V2 strategy failed: ${error.message}`);
      }
      
      console.log(`❌ No collection info found for ${contractAddress}`);
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
      
      // Požadovat sale, mint, bid_entered a bid_accepted eventy pro kompletní pokrytí
      const response = await fetch(`https://api.opensea.io/api/v2/events/accounts/${walletAddress}?event_type=sale&event_type=mint&event_type=bid_entered&event_type=bid_accepted&limit=20`, {
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
              // Detect mint groups not only by explicit 'mint' type, but also
              // by OpenSea 'sale' events where the seller is the NFT contract
              // and the buyer is our tracked wallet (typical mint pattern)
              const walletAddressLower = walletInfo.address.toLowerCase();
              const isMintGroup = group.every(e => {
                if (e.event_type === 'mint') return true;
                if (e.event_type === 'sale') {
                  const contract = e?.nft?.contract && typeof e.nft.contract === 'string' ? e.nft.contract.toLowerCase() : '';
                  const seller = typeof e?.seller === 'string' ? e.seller.toLowerCase() : '';
                  const buyer = typeof e?.buyer === 'string' ? e.buyer.toLowerCase() : '';
                  return Boolean(contract) && seller === contract && buyer === walletAddressLower;
                }
                return false;
              });

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
              
              // Determine if this is a bulk sale or bulk purchase based on wallet role
              const walletAddress = walletInfo.address.toLowerCase();
              const isBulkSale = base.seller && base.seller.toLowerCase() === walletAddress;
              const isBulkPurchase = base.buyer && base.buyer.toLowerCase() === walletAddress;
              
              if (isMintGroup) {
                await this.handleBulkMintEvent(syntheticEvent, walletInfo);
              } else if (isBulkSale) {
                // This is a bulk sale - wallet is selling multiple NFTs
                await this.handleBulkSaleEvent(syntheticEvent, walletInfo);
              } else if (isBulkPurchase && !isMintGroup) {
                // This is a bulk purchase - wallet is buying multiple NFTs (but not minting)
                await this.handleBulkPurchaseEvent(syntheticEvent, walletInfo);
              } else if (isBulkPurchase && isMintGroup) {
                // This is a bulk mint - wallet is minting multiple NFTs
                await this.handleBulkMintEvent(syntheticEvent, walletInfo);
              } else {
                // Fallback: if we can't determine, assume it's a mint if it's a mint group
                if (isMintGroup) {
                  await this.handleBulkMintEvent(syntheticEvent, walletInfo);
                } else {
                  await this.handleBulkPurchaseEvent(syntheticEvent, walletInfo);
                }
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

      // Zpracovávej sale, mint, bid_entered a bid_accepted eventy
      if (eventType !== 'sale' && eventType !== 'mint' && eventType !== 'bid_entered' && eventType !== 'bid_accepted') {
        console.log(`   ❌ Skipping - not a sale, mint, or bid event`);
        return;
      }

      // Debug: vypiš všechny adresy
      console.log(`   Debug - Seller: "${event.seller}"`);
      console.log(`   Debug - Buyer: "${event.buyer}"`);
      console.log(`   Debug - To: "${event.to_address}"`);
      console.log(`   Debug - Bidder: "${event.bidder}"`);
      console.log(`   Debug - Maker: "${event.maker}"`);
      const walletAddress = typeof walletInfo?.address === 'string' ? walletInfo.address.toLowerCase() : '';
      console.log(`   Debug - Wallet: "${walletAddress}"`);

      // Bezpečné určení typu s kontrolou undefined
      let isSale = false;
      let isPurchase = false;
      let isMint = false;
      let isBidAccepted = false;
      
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
          // Reclassify mints reported as sales: seller == NFT contract and buyer == our wallet
          try {
            const contractLower = nft?.contract && typeof nft.contract === 'string' ? nft.contract.toLowerCase() : '';
            const sellerLower = typeof event.seller === 'string' ? event.seller.toLowerCase() : '';
            const buyerLower = typeof event.buyer === 'string' ? event.buyer.toLowerCase() : '';
            if (!isMint && contractLower && sellerLower === contractLower && buyerLower === walletAddress) {
              isMint = true;
              isPurchase = false;
              console.log(`   🔄 Reclassified as MINT: sale where seller is contract and buyer is wallet`);
            }
          } catch {}
        }
        if (eventType === 'mint') {
          // Kontrola mint (STPN je recipient)
          if (typeof event.to_address === 'string' && event.to_address.toLowerCase() === walletAddress) {
            isMint = true;
            console.log(`   ✅ Detected MINT: ${walletInfo.name} minted NFT`);
          }
        }
        if (eventType === 'bid_accepted') {
          // Kontrola přijetí bidu (STPN je maker/seller - přijal WETH bid)
          if (typeof event.maker === 'string' && event.maker.toLowerCase() === walletAddress) {
            isSale = true;
            isBidAccepted = true;
            console.log(`   ✅ Detected BID ACCEPTED: ${walletInfo.name} accepted WETH bid for NFT`);
          }
          // Kontrola nákupu přes bid (STPN je bidder - koupil NFT přes bid)
          if (typeof event.bidder === 'string' && event.bidder.toLowerCase() === walletAddress) {
            isPurchase = true;
            console.log(`   ✅ Detected BID PURCHASE: ${walletInfo.name} bought NFT via bid`);
          }
        }
        if (eventType === 'bid_entered') {
          // Kontrola vložení bidu (STPN je bidder - vložil WETH bid)
          if (typeof event.bidder === 'string' && event.bidder.toLowerCase() === walletAddress) {
            console.log(`   ℹ️ Detected BID ENTERED: ${walletInfo.name} placed WETH bid (not a transaction yet)`);
            // Bid vložení není transakce, jen informace
            return;
          }
        }
      } catch (error) {
        console.log(`   ❌ Error determining transaction type: ${error.message}`);
        return;
      }
      
      console.log(`   Final: Sale=${isSale}, Purchase=${isPurchase}, Mint=${isMint}, BidAccepted=${isBidAccepted}`);
      
      if (!isSale && !isPurchase && !isMint && !isBidAccepted) {
        console.log(`   ❌ Skipping - not a relevant transaction for this wallet`);
        return;
      }

      // 🚫 CHECK FOR IGNORED COLLECTIONS
      const collectionSlug = (event.collection || '').toLowerCase();
      
      // Check if collection is in ignore list
      if (this.config.ignoredCollections && 
          this.config.ignoredCollections.length > 0 && 
          collectionSlug && 
          this.config.ignoredCollections.includes(collectionSlug)) {
        console.log(`   🚫 Skipping ignored collection: ${collectionSlug}`);
        return;
      }

      // Deduplicate by transaction hash to prevent multiple messages for the same sweep
      if (typeof txHashForDedup === 'string' && txHashForDedup.length > 0) {
        if (this.processedOpenSeaTxs.has(txHashForDedup)) {
          console.log(`   ⚠️ Skipping already processed tx: ${txHashForDedup}`);
          return;
        }
        this.processedOpenSeaTxs.add(txHashForDedup);
      }

      // Decide between single vs. bulk transaction handling
      const isBulk = this.isBulkEvent(event);
      console.log(`   Multiplicity check → isBulk=${isBulk}`);
      // Bulk handling for PURCHASE, MINT and SALE sweeps
      if (isBulk && isPurchase && !isMint) {
        await this.handleBulkPurchaseEvent(event, walletInfo);
        return;
      } else if (isBulk && isMint) {
        await this.handleBulkMintEvent(event, walletInfo);
        return;
      } else if (isBulk && isSale) {
        await this.handleBulkSaleEvent(event, walletInfo);
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

      // Pro bid_accepted eventy: zkus získat cenu z bid data
      if (isBidAccepted && price === 0 && event.bid) {
        try {
          if (event.bid.amount) {
            price = parseFloat(event.bid.amount) / Math.pow(10, event.bid.decimals || 18);
            const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
            priceUSD = price * nativePriceUSD;
            nativeSymbol = event.bid.currency || 'WETH';
            console.log(`   Bid Price: ${price} ${nativeSymbol}, USD: $${priceUSD}`);
          }
        } catch (error) {
          console.log(`   ⚠️ Could not parse bid price: ${error.message}`);
        }
      }

      // Special handling for MINT: get mint price via OpenSea API V2
      if (isMint && price === 0) {
        // First try to get mint price for specific NFT
        const mintPrice = await this.getMintPriceForNFT(nft.contract, nft.identifier, chainName);
        if (mintPrice.price > 0) {
          price = mintPrice.price;
          priceUSD = mintPrice.priceUSD;
          nativeSymbol = nativeSymbol || this.getNativeTokenSymbol(chainName);
          console.log(`   Mint Price via NFT events: ${price} ${nativeSymbol}, USD: $${priceUSD}`);
        } else if (event.transaction) {
          // Fallback to transaction-based lookup
          const txData = await this.getTransactionData(event.transaction, chainName);
          if (txData) {
            price = txData.price || 0;
            priceUSD = txData.priceUSD || 0;
            nativeSymbol = nativeSymbol || this.getNativeTokenSymbol(chainName);
            console.log(`   Mint Price via transaction: ${price} ${nativeSymbol}, USD: $${priceUSD}`);
          }
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
      console.log(`   🔍 Final transaction type determination: isMint=${isMint}, isPurchase=${isPurchase}, isSale=${isSale}`);
      const transactionData = {
        type: isMint ? 'mint' : (isPurchase ? 'purchase' : 'sale'),
        walletName: walletInfo.name,
        walletAddress: walletInfo.address,
        fromAddress: event.seller || event.maker || 'Unknown',
        toAddress: event.buyer || event.bidder || event.to_address || 'Unknown',
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
        floorPrice: floorPrice,
        isBidAccepted: isBidAccepted // Přidat flag pro bid accepted
      };

      console.log(`   📊 Transaction Data: ${transactionData.type} - ${transactionData.nftName} for ${price} ${nativeSymbol}`);

      // Pro sale: PnL
      if (isSale) {
        // Always search for purchase data via OpenSea API for real-time accuracy
        console.log(`🔍 Searching OpenSea API for purchase data for ${nftMetadata.name || `#${nft.identifier}`}...`);
        
        let purchaseData = null;
        
        try {
          // Always search for purchase data via OpenSea API for real-time accuracy
          console.log(`   🔍 Searching OpenSea API for purchase data...`);
          purchaseData = await this.recoverPurchaseData(nft.contract, nft.identifier, walletInfo.address, chainName);
          
          if (purchaseData && Number.isFinite(purchaseData.price) && purchaseData.price > 0) {
            console.log(`   ✅ Found purchase data via API: ${purchaseData.price} ETH`);
            
            // Calculate PnL and hold time from recovered data
            const pnl = price - purchaseData.price;
            const pnlPercent = ((pnl / purchaseData.price) * 100).toFixed(2);
            const pnlUSD = (priceUSD || 0) - (purchaseData.priceUSD || 0);
            
            // Calculate hold time
            const saleTimestamp = transactionData.timestamp.getTime();
            const buyTimestamp = purchaseData.timestamp;
            const holdTimeMs = saleTimestamp - buyTimestamp;
            
            let holdTime;
            if (holdTimeMs < 0) {
              holdTime = 'Unknown';
            } else {
              const holdTimeMinutes = Math.floor(holdTimeMs / (1000 * 60));
              const holdTimeHours = Math.floor(holdTimeMs / (1000 * 60 * 60));
              const holdTimeDays = Math.floor(holdTimeMs / (1000 * 60 * 60 * 24));
              
              if (holdTimeMinutes < 60) {
                holdTime = `${holdTimeMinutes}min`;
              } else if (holdTimeHours < 24) {
                const hours = Math.floor(holdTimeHours);
                const minutes = Math.floor(holdTimeMinutes % 60);
                holdTime = `${hours}h ${minutes}min`;
              } else {
                const days = Math.floor(holdTimeDays);
                if (days === 1) {
                  holdTime = `${days} day`;
                } else {
                  holdTime = `${days} days`;
                }
              }
            }
            
            // Store PnL data in transactionData for Discord
            transactionData.pnl = pnl;
            transactionData.pnlUSD = pnlUSD;
            transactionData.pnlPercent = pnlPercent;
            transactionData.buyPrice = purchaseData.price;
            transactionData.buyPriceUSD = purchaseData.priceUSD;
            transactionData.buyTimestamp = purchaseData.timestamp;
            transactionData.holdTime = holdTime;
            
            console.log(`   💰 PnL data recovered: bought for ${purchaseData.price} ${nativeSymbol}, sold for ${price} ${nativeSymbol}`);
            console.log(`   📈 PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} ${nativeSymbol} (${pnlPercent}%)`);
            console.log(`   ⏱️ Hold time: ${holdTime}`);
          } else {
            console.log(`   ❌ No purchase data found via API`);
          }
        } catch (error) {
          console.error(`   ❌ Error finding purchase data:`, error.message);
        }
      }

      // Pro purchase/mint: neukládat pro PnL - budeme to tahat z OpenSea API
      if (isPurchase || isMint) {
        console.log(`   💾 Purchase data will be fetched from OpenSea API when needed for PnL calculation`);
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

    // Get collection royalties info
    let royaltiesInfo = null;
    try {
      if (tokenName) {
        royaltiesInfo = await this.getCollectionRoyalties(tokenName, chainName);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not fetch royalties info: ${error.message}`);
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
      console.log(`   💾 Purchase data will be fetched from OpenSea API when needed for PnL calculation`);
      // No need to store in cache - we'll fetch from OpenSea API when needed
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
      floorPrice: floorPrice,
      royaltiesInfo: royaltiesInfo
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
        'ApeChain': 'ape_chain',
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
      'ape_chain': 'ApeChain',
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
        'ApeChain': 'ape_chain',
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
   * Recover missing purchase record fields by querying OpenSea API for historical sale events
   * where the tracked wallet was the buyer of the given contract/tokenId.
   * Uses the events endpoint as recommended in OpenSea documentation.
   */
  async recoverPurchaseData(contractAddress, tokenId, walletAddress, chainName) {
    try {
      const apiKey = this.config.opensea.apiKey;
      const chainMap = {
        'Ethereum': 'ethereum',
        'ApeChain': 'ape_chain',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      const chain = chainMap[chainName] || 'ethereum';

      console.log(`🔍 Searching OpenSea API v2 for previous buy via NFT events: ${contractAddress} #${tokenId} on ${chainName}`);

      // Strategy A: NFT-specific sales history (last 2 sales, desc). events[1] is the previous sale.
      const byNftUrl = `https://api.opensea.io/api/v2/events/chain/${chain}/contract/${contractAddress}/nfts/${tokenId}?event_type=sale&limit=2&direction=desc`;
      console.log(`🔗 API URL (by NFT): ${byNftUrl}`);

      let response = await fetch(byNftUrl, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const events = Array.isArray(data.asset_events) ? data.asset_events : [];
        console.log(`📊 NFT events received: ${events.length}`);
        if (events.length >= 2) {
          const prev = events[1];
          // Prefer sale_price/payment_token fields per v2 docs
          let price = 0;
          let decimals = 18;
          let symbol = 'ETH';

          if (prev.payment_token) {
            decimals = Number(prev.payment_token.decimals ?? 18);
            symbol = prev.payment_token.symbol || 'ETH';
          }
          if (prev.sale_price != null) {
            price = Number(prev.sale_price) / Math.pow(10, decimals);
          } else if (prev.payment && prev.payment.quantity) {
            // Fallback for alternate shape
            price = Number(prev.payment.quantity) / Math.pow(10, Number(prev.payment.decimals ?? 18));
            symbol = prev.payment?.symbol || symbol;
          }

          if (!Number.isFinite(price) || price < 0) {
            console.log('❌ Invalid previous sale price payload');
          } else {
            const ts = prev.transaction?.timestamp
              || prev.event_timestamp
              || prev.closing_date
              || Date.now();
            const tsMs = typeof ts === 'number' ? (String(ts).length > 12 ? ts : ts * 1000) : new Date(ts).getTime();

            const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
            const priceUSD = price * nativePriceUSD;

            console.log(`✅ Previous buy inferred from prior sale: ${price} ${symbol} at ${new Date(tsMs).toISOString()}`);
            return { price, priceUSD, timestamp: tsMs };
          }
        }
      } else {
        console.log(`❌ NFT events request failed: ${response.status} ${response.statusText}`);
      }

      // Strategy B: Fallback to account-based scan (buyer wallet history)
      console.log(`🔍 Fallback: scanning buyer account events for acquisition...`);
      const occurredAfter = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      const byAccountUrl = `https://api.opensea.io/api/v2/events/accounts/${walletAddress}?event_type=sale&event_type=mint&event_type=bid_accepted&occurred_after=${occurredAfter}&limit=100&chain=${chain}`;
      console.log(`🔗 API URL (by account): ${byAccountUrl}`);

      response = await fetch(byAccountUrl, {
        headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.log(`❌ API response not OK: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      console.log(`📊 Account events received: ${data.asset_events?.length || 0}`);
      if (!data.asset_events || !Array.isArray(data.asset_events)) {
        return null;
      }

      const purchaseEvent = data.asset_events.find(event => {
        const nft = event.nft;
        if (!nft || !nft.contract || !nft.identifier) return false;
        if (nft.contract.toLowerCase() !== contractAddress.toLowerCase() || nft.identifier !== tokenId.toString()) return false;
        if (event.event_type === 'sale') return event.buyer && event.buyer.toLowerCase() === walletAddress.toLowerCase();
        if (event.event_type === 'mint') return event.to_address && event.to_address.toLowerCase() === walletAddress.toLowerCase();
        if (event.event_type === 'bid_accepted') return event.bidder && event.bidder.toLowerCase() === walletAddress.toLowerCase();
        return false;
      });

      if (!purchaseEvent) {
        console.log(`❌ No acquisition event found for ${walletAddress} → ${contractAddress} #${tokenId}`);
        return null;
      }

      let price = 0;
      if (purchaseEvent.payment && purchaseEvent.payment.quantity) {
        price = parseFloat(purchaseEvent.payment.quantity) / Math.pow(10, purchaseEvent.payment.decimals || 18);
      } else if (purchaseEvent.bid && purchaseEvent.bid.amount) {
        price = parseFloat(purchaseEvent.bid.amount) / Math.pow(10, purchaseEvent.bid.decimals || 18);
      }
      if (purchaseEvent.event_type === 'mint' && (!Number.isFinite(price) || price < 0)) {
        price = 0;
      } else if (!Number.isFinite(price) || price < 0) {
        return null;
      }

      const nativePriceUSD = await this.getNativeTokenPriceUSD(chainName);
      const priceUSD = price * nativePriceUSD;
      const timestamp = typeof purchaseEvent.event_timestamp === 'number'
        ? purchaseEvent.event_timestamp * 1000
        : new Date(purchaseEvent.event_timestamp || Date.now()).getTime();

      console.log(`✅ Purchase data recovered (fallback): ${price} ETH ($${priceUSD}) at ${new Date(timestamp).toISOString()}`);
      return { price, priceUSD, timestamp };
      
    } catch (error) {
      console.error(`❌ Error in recoverPurchaseData:`, error.message);
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
        'ApeChain': 'ape_chain',
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

  // These functions are no longer needed since we always fetch purchase data from OpenSea API
  // async fetchHistoricalPurchases() { ... }
  // async fetchWalletHistoricalPurchases(walletAddress, walletInfo) { ... }

  /**
   * Bulk SALE handling with PnL calculation. Calculate PnL for each item and send one embed.
   */
  async handleBulkSaleEvent(event, walletInfo) {
    console.log(`   📦 Bulk SALE detected for ${walletInfo.name}.`);
    const txHash = event?.transaction || 'Unknown';
    const chainName = this.getChainFromOpenSeaChain(event.chain);

    const reportedQty = typeof event?.quantity === 'undefined' ? '-' : event.quantity;
    const quantity = Number(reportedQty) || (Array.isArray(event?.nfts) ? event.nfts.length : 0) || 0;

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

    // Get collection royalties info
    let royaltiesInfo = null;
    try {
      if (tokenName) {
        royaltiesInfo = await this.getCollectionRoyalties(tokenName, chainName);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not fetch royalties info: ${error.message}`);
    }

    // Compute USD conversions for the lot
    let nativeUsd = 0;
    try {
      nativeUsd = await this.getNativeTokenPriceUSD(chainName);
    } catch (e) {
      nativeUsd = 0;
    }
    const totalPriceUSD = nativeUsd && totalPrice ? totalPrice * nativeUsd : undefined;
    const unitPrice = quantity > 0 ? totalPrice / quantity : 0;
    const unitPriceUSD = nativeUsd && unitPrice ? unitPrice * nativeUsd : 0;

    // Calculate PnL for each item and aggregate
    let totalPnL = 0;
    let totalPnLUSD = 0;
    let totalBuyPrice = 0;
    let totalBuyPriceUSD = 0;
    let totalHoldTime = 0;
    let itemsWithPnL = 0;

    if (Array.isArray(event?.nfts) && event.nfts.length > 0) {
      for (const item of event.nfts) {
        if (item?.contract && item?.identifier) {
          // Always search for purchase data via OpenSea API for real-time accuracy
          console.log(`   🔍 Searching OpenSea API for purchase data for ${item.name || `#${item.identifier}`}...`);
          const purchaseData = await this.recoverPurchaseData(item.contract, item.identifier, walletInfo.address, chainName);
          
          if (purchaseData && Number.isFinite(purchaseData.price) && purchaseData.price > 0) {
            console.log(`   ✅ Found purchase data via API for ${item.name || `#${item.identifier}`}: ${purchaseData.price} ETH`);
          } else {
            console.log(`   ❌ No purchase data found for ${item.name || `#${item.identifier}`}`);
          }
            
          // Calculate PnL if we have purchase data
          if (purchaseData && Number.isFinite(purchaseData.price) && purchaseData.price > 0) {
            const itemPnL = unitPrice - purchaseData.price;
            const itemPnLUSD = unitPriceUSD - (purchaseData.priceUSD || 0);
            
            totalPnL += itemPnL;
            totalPnLUSD += itemPnLUSD;
            totalBuyPrice += purchaseData.price;
            totalBuyPriceUSD += purchaseData.priceUSD || 0;
            
            // Calculate hold time
            if (purchaseData.timestamp) {
              const saleTimestamp = typeof event.event_timestamp === 'number' 
                ? event.event_timestamp * 1000 
                : new Date(event.event_timestamp || Date.now()).getTime();
              const holdTimeMs = saleTimestamp - purchaseData.timestamp;
              if (holdTimeMs > 0) {
                totalHoldTime += holdTimeMs;
              }
            }
            
            itemsWithPnL++;
            
            // No need to manage cache since we're always using OpenSea API
            
            console.log(`   💰 PnL for ${item.name || `#${item.identifier}`}: ${itemPnL > 0 ? '+' : ''}${itemPnL.toFixed(6)} ${nativeSymbol}`);
          }
        }
      }
      
      // No need to save purchase data since we're always using OpenSea API
    }

    // Calculate averages
    const avgPnL = itemsWithPnL > 0 ? totalPnL / itemsWithPnL : 0;
    const avgPnLUSD = itemsWithPnL > 0 ? totalPnLUSD / itemsWithPnL : 0;
    const avgBuyPrice = itemsWithPnL > 0 ? totalBuyPrice / itemsWithPnL : 0;
    const avgBuyPriceUSD = itemsWithPnL > 0 ? totalBuyPriceUSD / itemsWithPnL : 0;
    const avgHoldTime = itemsWithPnL > 0 ? totalHoldTime / itemsWithPnL : 0;

    // Format hold time
    let holdTimeDisplay = '-';
    if (avgHoldTime > 0) {
      const holdTimeMinutes = Math.floor(avgHoldTime / (1000 * 60));
      const holdTimeHours = Math.floor(avgHoldTime / (1000 * 60 * 60));
      const holdTimeDays = Math.floor(avgHoldTime / (1000 * 60 * 60 * 24));
      
      if (holdTimeMinutes < 60) {
        holdTimeDisplay = `${holdTimeMinutes}min`;
      } else if (holdTimeHours < 24) {
        const hours = Math.floor(holdTimeHours);
        const minutes = Math.floor(holdTimeMinutes % 60);
        holdTimeDisplay = `${hours}h ${minutes}min`;
      } else {
        const days = Math.floor(holdTimeDays);
        if (days === 1) {
          holdTimeDisplay = `${days} day`;
        } else {
          holdTimeDisplay = `${days} days`;
        }
      }
    }

    const transactionData = {
      type: 'sale',
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
      price: unitPrice,
      priceUSD: unitPriceUSD,
      totalPrice: totalPrice,
      totalPriceUSD: totalPriceUSD,
      quantity: quantity,
      imageUrl: representative?.image_url,
      nftName: representative?.name,
      nativeSymbol: nativeSymbol,
      floorPrice: floorPrice,
      // PnL data
      buyPrice: avgBuyPrice,
      buyPriceUSD: avgBuyPriceUSD,
      pnl: avgPnL,
      pnlUSD: avgPnLUSD,
      holdTime: holdTimeDisplay,
      royaltiesInfo: royaltiesInfo
    };

    console.log(`   📦 Bulk SALE Transaction Data ready: ${quantity} items, total ${totalPrice} ${nativeSymbol}`);
    console.log(`   💰 Average PnL: ${avgPnL > 0 ? '+' : ''}${avgPnL.toFixed(6)} ${nativeSymbol} (${itemsWithPnL}/${quantity} items with PnL data)`);
    console.log(`   ⏱️ Average hold time: ${holdTimeDisplay}`);
    await this.sendDiscordNotification(transactionData, this);
  }

  /**
   * Get known royalties for popular collections that OpenSea API doesn't provide
   */
  getKnownCollectionRoyalties(slug, chainName) {
    const knownRoyalties = {
      // Base collections
      'basepaint': 2.5, // BasePaint has 2.5% royalties
      'friend.tech': 5, // Friend.tech has 5% royalties
      'degen': 5, // Degen has 5% royalties
      
      // Ethereum collections
      'boredapeyachtclub': 2.5, // BAYC has 2.5% royalties
      'cryptopunks': 0, // CryptoPunks has 0% royalties
      'doodles': 5, // Doodles has 5% royalties
      'azuki': 5, // Azuki has 5% royalties
      'pudgypenguins': 5, // Pudgy Penguins has 5% royalties
      
      // Polygon collections
      'y00ts': 5, // y00ts has 5% royalties
      'degenape': 5, // Degen Ape has 5% royalties
    };
    
    return knownRoyalties[slug.toLowerCase()] || null;
  }

  /**
   * Get collection creator fees from OpenSea API v2
   * Creator fees are different from royalties and are always available
   */
  async getCollectionCreatorFees(slug, chainName, contractAddress = null, tokenId = null) {
    try {
      const apiKey = this.config.opensea.apiKey;
      
      // Map chain names to OpenSea chain identifiers
      const chainMap = {
        'Ethereum': 'ethereum',
        'ApeChain': 'ape_chain',
        'Base': 'base',
        'Polygon': 'polygon',
        'Arbitrum': 'arbitrum',
        'Optimism': 'optimism',
        'BSC': 'bsc',
        'Berachain': 'berachain',
        'Abstract': 'abstract'
      };
      
      const chain = chainMap[chainName] || 'ethereum';
      
      // Extract creator fees information
      const creatorFees = {
        percentage: null,
        is_enforced: false,
        is_optional: true
      };
      
      // Strategy 1: Try to get creator fees from NFT-specific endpoint (if contract and token ID provided)
      if (contractAddress && tokenId) {
        try {
          const nftResponse = await fetch(`https://api.opensea.io/api/v2/chain/${chain}/contract/${contractAddress}/nfts/${tokenId}`, {
            headers: {
              'X-API-KEY': apiKey,
              'Accept': 'application/json'
            }
          });
          
          if (nftResponse.ok) {
            const nftData = await nftResponse.json();
            console.log(`🔍 NFT-specific data for ${contractAddress}/${tokenId}:`, JSON.stringify(nftData, null, 2));
            
            // Check for creator fees in NFT data
            if (nftData.creator_fees && Array.isArray(nftData.creator_fees)) {
              let highestFee = null;
              for (const fee of nftData.creator_fees) {
                if (fee.percentage !== null && fee.percentage !== undefined) {
                  if (highestFee === null || fee.percentage > highestFee) {
                    highestFee = fee.percentage;
                  }
                }
              }
              
              if (highestFee !== null) {
                creatorFees.percentage = highestFee;
                console.log(`✅ Found creator fees from NFT endpoint: ${highestFee}%`);
              }
            }
            
            // Check for creator fees in NFT metadata
            if (!creatorFees.percentage && nftData.metadata && nftData.metadata.creator_fees) {
              creatorFees.percentage = nftData.metadata.creator_fees;
              console.log(`✅ Found creator fees from NFT metadata: ${nftData.metadata.creator_fees}%`);
            }
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch NFT-specific data: ${error.message}`);
        }
      }
      
      // Strategy 2: Try to get creator fees from collection details endpoint
      if (!creatorFees.percentage) {
        try {
          const response = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}&include_hidden=true`, {
            headers: {
              'X-API-KEY': apiKey,
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log(`🔍 Collection v2 data for ${slug}:`, JSON.stringify(data, null, 2));
            
            // Check for creator fees in fees array (this is where OpenSea v2 stores creator fees!)
            if (data.fees && Array.isArray(data.fees)) {
              console.log(`💰 Found ${data.fees.length} total fees in collection data`);
              
              // Enhanced logic for detecting creator fees:
              // 1. First try to find fees marked as optional (required: false)
              let creatorFeesList = data.fees.filter(fee => fee.required === false);
              
              // 2. If no optional fees found, try to identify creator fees by recipient patterns
              if (creatorFeesList.length === 0) {
                console.log(`🔍 No optional fees found, trying to identify creator fees by recipient patterns...`);
                
                // Look for fees that might be creator fees based on recipient address patterns
                // Creator fees often go to the collection owner or a specific creator address
                const ownerAddress = data.owner?.toLowerCase();
                const editorAddresses = data.editors?.map(e => e.toLowerCase()) || [];
                
                creatorFeesList = data.fees.filter(fee => {
                  if (!fee.recipient) return false;
                  
                  const recipientLower = fee.recipient.toLowerCase();
                  
                  // Check if this fee goes to the collection owner or editors (likely creator fees)
                  if (ownerAddress && recipientLower === ownerAddress) {
                    console.log(`✅ Identified creator fee: ${fee.fee}% -> owner address ${fee.recipient}`);
                    return true;
                  }
                  
                  if (editorAddresses.some(editor => recipientLower === editor)) {
                    console.log(`✅ Identified creator fee: ${fee.fee}% -> editor address ${fee.recipient}`);
                    return true;
                  }
                  
                  // Check for common creator fee patterns (non-zero addresses that aren't OpenSea)
                  if (fee.fee > 0 && fee.fee <= 10 && 
                      !recipientLower.includes('opensea') && 
                      !recipientLower.includes('0x0000')) {
                    console.log(`🔍 Potential creator fee: ${fee.fee}% -> ${fee.recipient} (marked as required: ${fee.required})`);
                    return true;
                  }
                  
                  return false;
                });
              }
              
              // Filter marketplace fees (remaining fees that aren't creator fees)
              const marketplaceFees = data.fees.filter(fee => !creatorFeesList.includes(fee));
              
              console.log(`💰 Identified ${creatorFeesList.length} creator fees and ${marketplaceFees.length} marketplace fees`);
              
              if (creatorFeesList.length > 0) {
                // Find the highest creator fee percentage
                let highestFee = null;
                let highestFeeRecipient = null;
                
                for (const fee of creatorFeesList) {
                  if (fee.fee !== null && fee.fee !== undefined) {
                    if (highestFee === null || fee.fee > highestFee) {
                      highestFee = fee.fee;
                      highestFeeRecipient = fee.recipient;
                    }
                  }
                }
                
                if (highestFee !== null) {
                  creatorFees.percentage = highestFee;
                  console.log(`✅ Found creator fees: ${highestFee}% (recipient: ${highestFeeRecipient})`);
                }
                
                // Creator fees are enforced if any fee has required: true
                creatorFees.is_enforced = creatorFeesList.some(fee => fee.required === true);
                
                // Log all creator fees for debugging
                console.log(`📋 All creator fees:`, creatorFeesList.map(f => `${f.fee}% -> ${f.recipient} (required: ${f.required})`));
              }
              
              // Log marketplace fees for reference
              if (marketplaceFees.length > 0) {
                console.log(`🏪 Marketplace fees:`, marketplaceFees.map(f => `${f.fee}% -> ${f.recipient} (required: ${f.required})`));
              }
            }
            
            // Fallback: check for creator fees in various other possible fields
            if (!creatorFees.percentage && data.creator_fees && Array.isArray(data.creator_fees)) {
              let highestFee = null;
              for (const fee of data.creator_fees) {
                if (fee.percentage !== null && fee.percentage !== undefined) {
                  if (highestFee === null || fee.percentage > highestFee) {
                    highestFee = fee.percentage;
                  }
                }
              }
              
              if (highestFee !== null) {
                creatorFees.percentage = highestFee;
                console.log(`✅ Found creator fees from v2 API: ${highestFee}%`);
              }
            }
            
            // Alternative: check for creator fees in collection stats
            if (!creatorFees.percentage && data.stats && data.stats.creator_fees) {
              creatorFees.percentage = data.stats.creator_fees;
              console.log(`✅ Found creator fees from v2 stats: ${data.stats.creator_fees}%`);
            }
            
            // Alternative: check for creator fees in collection metadata
            if (!creatorFees.percentage && data.metadata && data.metadata.creator_fees) {
              creatorFees.percentage = data.metadata.creator_fees;
              console.log(`✅ Found creator fees from v2 metadata: ${data.metadata.creator_fees}%`);
            }
            
            // Alternative: check for creator fees in collection settings
            if (!creatorFees.percentage && data.settings && data.settings.creator_fees) {
              creatorFees.percentage = data.settings.creator_fees;
              console.log(`✅ Found creator fees from v2 settings: ${data.settings.creator_fees}%`);
            }
            
            // Try to get creator fees from contract data
            if (!creatorFees.percentage && data.contracts && Array.isArray(data.contracts)) {
              for (const contract of data.contracts) {
                if (contract.creator_fees && contract.creator_fees > 0) {
                  creatorFees.percentage = contract.creator_fees;
                  console.log(`✅ Found creator fees from v2 contract: ${contract.creator_fees}%`);
                  break;
                }
              }
            }
            
            // If not enforced, mark as optional
            if (!creatorFees.is_enforced) {
              creatorFees.is_optional = true;
            }
            
          } else {
            console.log(`❌ Failed to fetch collection data for ${slug} on ${chainName}: ${response.status}`);
          }
          
        } catch (error) {
          console.log(`⚠️ Could not fetch collection data: ${error.message}`);
        }
      }
      
      console.log(`✅ Creator fees info: ${creatorFees.percentage !== null ? creatorFees.percentage + '%' : 'N/A'} (${creatorFees.is_enforced ? 'enforced' : 'optional'})`);
      return creatorFees;
      
    } catch (error) {
      console.error(`Error fetching creator fees for ${slug} on ${chainName}:`, error.message);
      return null;
    }
  }

  async handleBulkPurchaseEvent(event, walletInfo) {
    console.log(`   📦 Bulk PURCHASE detected for ${walletInfo.name}.`);
    const txHash = event?.transaction || 'Unknown';
    const chainName = this.getChainFromOpenSeaChain(event.chain);

    const reportedQty = typeof event?.quantity === 'undefined' ? '-' : event.quantity;
    const quantity = Number(reportedQty) || (Array.isArray(event?.nfts) ? event.nfts.length : 0) || 0;

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

    // Get collection royalties info
    let royaltiesInfo = null;
    try {
      if (tokenName) {
        royaltiesInfo = await this.getCollectionRoyalties(tokenName, chainName);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not fetch royalties info: ${error.message}`);
    }

    // Compute USD conversions for the lot
    let nativeUsd = 0;
    try {
      nativeUsd = await this.getNativeTokenPriceUSD(chainName);
    } catch (e) {
      nativeUsd = 0;
    }
    const totalPriceUSD = nativeUsd && totalPrice ? totalPrice * nativeUsd : undefined;
    const unitPrice = quantity > 0 ? totalPrice / quantity : 0;
    const unitPriceUSD = nativeUsd && unitPrice ? unitPrice * nativeUsd : 0;

    // Calculate PnL for each item and aggregate
    let totalPnL = 0;
    let totalPnLUSD = 0;
    let totalBuyPrice = 0;
    let totalBuyPriceUSD = 0;
    let totalHoldTime = 0;
    let itemsWithPnL = 0;

    if (Array.isArray(event?.nfts) && event.nfts.length > 0) {
      for (const item of event.nfts) {
        if (item?.contract && item?.identifier) {
          // Always search for purchase data via OpenSea API for real-time accuracy
          console.log(`   🔍 Searching OpenSea API for purchase data for ${item.name || `#${item.identifier}`}...`);
          const purchaseData = await this.recoverPurchaseData(item.contract, item.identifier, walletInfo.address, chainName);
          
          if (purchaseData && Number.isFinite(purchaseData.price) && purchaseData.price > 0) {
            console.log(`   ✅ Found purchase data via API for ${item.name || `#${item.identifier}`}: ${purchaseData.price} ETH`);
          } else {
            console.log(`   ❌ No purchase data found for ${item.name || `#${item.identifier}`}`);
          }
            
          // Calculate PnL if we have purchase data
          if (purchaseData && Number.isFinite(purchaseData.price) && purchaseData.price > 0) {
            const itemPnL = unitPrice - purchaseData.price;
            const itemPnLUSD = unitPriceUSD - (purchaseData.priceUSD || 0);
            
            totalPnL += itemPnL;
            totalPnLUSD += itemPnLUSD;
            totalBuyPrice += purchaseData.price;
            totalBuyPriceUSD += purchaseData.priceUSD || 0;
            
            // Calculate hold time
            if (purchaseData.timestamp) {
              const saleTimestamp = typeof event.event_timestamp === 'number' 
                ? event.event_timestamp * 1000 
                : new Date(event.event_timestamp || Date.now()).getTime();
              const holdTimeMs = saleTimestamp - purchaseData.timestamp;
              if (holdTimeMs > 0) {
                totalHoldTime += holdTimeMs;
              }
            }
            
            itemsWithPnL++;
            
            // No need to manage cache since we're always using OpenSea API
            
            console.log(`   💰 PnL for ${item.name || `#${item.identifier}`}: ${itemPnL > 0 ? '+' : ''}${itemPnL.toFixed(6)} ${nativeSymbol}`);
          }
        }
      }
      
      // No need to save purchase data since we're always using OpenSea API
    }

    // Calculate averages
    const avgPnL = itemsWithPnL > 0 ? totalPnL / itemsWithPnL : 0;
    const avgPnLUSD = itemsWithPnL > 0 ? totalPnLUSD / itemsWithPnL : 0;
    const avgBuyPrice = itemsWithPnL > 0 ? totalBuyPrice / itemsWithPnL : 0;
    const avgBuyPriceUSD = itemsWithPnL > 0 ? totalBuyPriceUSD / itemsWithPnL : 0;
    const avgHoldTime = itemsWithPnL > 0 ? totalHoldTime / itemsWithPnL : 0;

    // Format hold time
    let holdTimeDisplay = '-';
    if (avgHoldTime > 0) {
      const holdTimeMinutes = Math.floor(avgHoldTime / (1000 * 60));
      const holdTimeHours = Math.floor(avgHoldTime / (1000 * 60 * 60));
      const holdTimeDays = Math.floor(avgHoldTime / (1000 * 60 * 60 * 24));
      
      if (holdTimeMinutes < 60) {
        holdTimeDisplay = `${holdTimeMinutes}min`;
      } else if (holdTimeHours < 24) {
        const hours = Math.floor(holdTimeHours);
        const minutes = Math.floor(holdTimeMinutes % 60);
        holdTimeDisplay = `${hours}h ${minutes}min`;
      } else {
        const days = Math.floor(holdTimeDays);
        if (days === 1) {
          holdTimeDisplay = `${days} day`;
        } else {
          holdTimeDisplay = `${days} days`;
        }
      }
    }

    const transactionData = {
      type: 'purchase',
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
      floorPrice: floorPrice,
      // PnL data
      buyPrice: avgBuyPrice,
      buyPriceUSD: avgBuyPriceUSD,
      pnl: avgPnL,
      pnlUSD: avgPnLUSD,
      holdTime: holdTimeDisplay,
      royaltiesInfo: royaltiesInfo
    };

    console.log(`   📦 Bulk PURCHASE Transaction Data ready: ${quantity} items, total ${totalPrice} ${nativeSymbol}`);
    console.log(`   💰 Average PnL: ${avgPnL > 0 ? '+' : ''}${avgPnL.toFixed(6)} ${nativeSymbol} (${itemsWithPnL}/${quantity} items with PnL data)`);
    console.log(`   ⏱️ Average hold time: ${holdTimeDisplay}`);
    await this.sendDiscordNotification(transactionData, this);
  }
}

module.exports = NFTTracker; 