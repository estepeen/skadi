const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const config = require('../config');
const CommandManager = require('./commandManager');

class DiscordNotifier {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    this.isReady = false;
    this.commandManager = new CommandManager();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('ready', async () => {
      console.log(`🤖 Discord bot logged in as ${this.client.user.tag}`);
      this.isReady = true;
      
      // Register slash commands
      await this.registerSlashCommands();
    });

    this.client.on('error', (error) => {
      console.error('❌ Discord bot error:', error);
    });

    // Handle slash command interactions
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      
      try {
        await this.commandManager.executeCommand(interaction);
      } catch (error) {
        console.error('❌ Error handling interaction:', error);
      }
    });
  }

  async connect() {
    try {
      await this.client.login(config.discord.botToken);
      console.log('🔗 Connecting to Discord...');
      
      // Wait for the bot to be ready
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Discord bot connection timeout'));
        }, 30000); // 30 second timeout
        
        this.client.once('ready', () => {
          clearTimeout(timeout);
          console.log(`🤖 Discord bot logged in as ${this.client.user.tag}`);
          this.isReady = true;
          resolve();
        });
        
        this.client.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      console.error('❌ Failed to connect to Discord:', error.message);
      throw error;
    }
  }

  async registerSlashCommands() {
    try {
      console.log('🔧 Registering slash commands...');
      
      // Get all commands from command manager
      const commands = this.commandManager.getCommands();
      
      // Register commands globally (this may take up to 1 hour to propagate)
      const result = await this.client.application.commands.set(commands);
      
      console.log(`✅ Successfully registered ${result.size} slash commands:`);
      result.forEach(command => {
        console.log(`   /${command.name}: ${command.description}`);
      });
      
    } catch (error) {
      console.error('❌ Failed to register slash commands:', error);
    }
  }

  async sendNotification(transactionData, nftTracker = null) {
    if (!this.isReady) {
      console.log('⚠️ Discord bot not ready yet, skipping notification');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.discord.channelId);
      if (!channel) {
        console.error('❌ Discord channel not found');
        return;
      }

      const embed = await this.createEmbed(transactionData, nftTracker);

      // Optional role mention for bulk NFT sweeps (>=3 items) - only for purchase
      let content = undefined;
      if (transactionData.type === 'purchase' && transactionData.isBulk === true && Number(transactionData.quantity) >= 3 && config.discord.nftsRoleId) {
        content = `<@&${config.discord.nftsRoleId}>`;
      }

      await channel.send({ content, embeds: [embed] });
      
      console.log(`📨 Discord notification sent for ${transactionData.type}`);
    } catch (error) {
      console.error('❌ Failed to send Discord notification:', error.message);
    }
  }

  async createEmbed(transactionData, nftTracker = null) {
    const {
      type, walletName, walletAddress, fromAddress, toAddress, tokenName, tokenId, contractAddress,
      transactionHash, chainName, timestamp, price, priceUSD, totalPrice, totalPriceUSD,
      quantity = 1, imageUrl, nftName, nativeSymbol, floorPrice, buyPrice, buyPriceUSD, isSweep = false, buyTimestamp,
      isBulk = false, holdTime, pnl, pnlUSD
    } = transactionData;

    // Get collection info for better display
    let collectionInfo = null;
    let collectionName = tokenName;
    let floorPriceValue = floorPrice;
    
    if (contractAddress && nftTracker) {
      try {
        // Try to get collection info for better name and floor price
        const collectionSlug = tokenName && tokenName !== 'Unknown' ? tokenName : null;
        collectionInfo = collectionSlug 
          ? await nftTracker.getCollectionInfoBySlug(collectionSlug, chainName)
          : await nftTracker.getCollectionInfo(contractAddress, chainName);
        
        if (collectionInfo && collectionInfo.name) {
          collectionName = collectionInfo.name;
        }
      } catch (error) {
        console.log(`⚠️ Error getting collection info for display: ${error.message}`);
      }
    }

    // Set color and action based on transaction type
    let color, action, emoji;
    switch (type) {
      case 'purchase': 
        if (isBulk && quantity >= 3) {
          color = 0x00ff00; 
          action = 'swept'; 
          emoji = '🧹'; 
        } else {
          color = 0x00ff00; 
          action = 'bought'; 
          emoji = '🟢'; 
        }
        break;
      case 'sale': 
        // Check for paper hands (sold within 48h with >20% loss)
        const isPaperHands = this.isPaperHands(transactionData);
        
        if (isPaperHands) {
          color = 0xff0000; 
          action = 'papered'; 
          emoji = '🧻'; 
        } else if (quantity >= 3) {
          color = 0xff0000; 
          action = 'dumped'; 
          emoji = '💀'; 
        } else {
          color = 0xff0000; 
          action = 'sold'; 
          emoji = '🔴'; 
        }
        break;
      case 'mint': 
        if (isBulk && quantity >= 3) {
          color = 0x0099ff; action = 'minted'; emoji = '🧹';
        } else {
          color = 0x0099ff; action = 'minted'; emoji = '🔵';
        }
        break;
      default: color = 0x0099ff; action = 'transacted'; emoji = '🔵';
    }

    // Derive token ID for display/URL robustly
    let tokenIdNumber = 'Unknown';
    if (typeof tokenId === 'string') {
      if (tokenId.startsWith('0x')) {
        try { tokenIdNumber = String(parseInt(tokenId, 16)); } catch { tokenIdNumber = tokenId; }
      } else {
        tokenIdNumber = tokenId;
      }
    } else if (typeof tokenId === 'number') {
      tokenIdNumber = String(tokenId);
    }
    // Prefer token id parsed from nftName pattern "... #1234"
    if (typeof nftName === 'string') {
      const m = nftName.match(/#(\d+)/);
      if (m && m[1]) tokenIdNumber = m[1];
    }
    
    // Create display name with collection name and token ID
    let nftDisplayName;
    if (isBulk && tokenName && tokenName !== 'Unknown') {
      nftDisplayName = tokenName;
    } else if (nftName && nftName !== 'Unknown') {
      nftDisplayName = nftName;
    } else if (collectionName && collectionName !== 'Unknown') {
      nftDisplayName = `${collectionName} #${tokenIdNumber}`;
    } else {
      nftDisplayName = `NFT #${tokenIdNumber}`;
    }
    
    let displayTitle;
    if (type === 'sale' && isBulk) {
      // Bulk SELL custom title: "🔴 {User} dumped {quantity}x {Collection} NFTs 💀"
      const skull = quantity >= 3 ? ' 💀' : '';
      const qtyText = `${quantity}x`;
      displayTitle = `🔴 ${walletName} dumped ${qtyText} ${collectionName || tokenName || 'NFT'} NFTs${skull}`;
    } else if (type === 'sale') {
      // Always start with red dot, and move special emoji to the end
      const suffix = (emoji && emoji !== '🔴') ? ` ${emoji}` : '';
      // Special handling for bid accepted events
      if (transactionData.isBidAccepted) {
        displayTitle = `🔴 ${walletName} accepted WETH bid for ${nftDisplayName} 💰`;
      } else {
        displayTitle = `🔴 ${walletName} ${action} ${nftDisplayName}${suffix}`;
      }
    } else if (isBulk && type === 'purchase') {
      // Title rules for bulk BUY (updated):
      // 2  → "bought 2x {Collection} NFT 👏"
      // 3–9 → "swept {Collection} 🧹🧹"
      // 10+ → "swept {Collection} 🔥🔥🔥"
      if (quantity === 2) {
        displayTitle = `🟢 ${walletName} bought 2x ${collectionName || tokenName || 'collection'} NFT 👏`;
      } else if (quantity >= 10) {
        displayTitle = `🟢 ${walletName} swept ${collectionName || tokenName || 'collection'} 🔥🔥🔥`;
      } else if (quantity >= 3) {
        displayTitle = `🟢 ${walletName} swept ${collectionName || tokenName || 'collection'} 🧹🧹`;
      } else {
        displayTitle = `🟢 ${walletName} bought ${collectionName || tokenName || 'collection'}`;
      }
    } else if (isBulk && type === 'mint') {
      // Title rules for bulk MINT:
      // 2–4 → 👀, 5–9 → 🚀, 10+ → 🔥 (blue dot at start)
      let suffix = '';
      if (quantity >= 10) suffix = '🔥';
      else if (quantity >= 5) suffix = '🚀';
      else if (quantity >= 2) suffix = '👀';
      const suffixText = suffix ? ` ${suffix}` : '';
      displayTitle = `🔵 ${walletName} minted ${collectionName || tokenName || 'collection'}${suffixText}`;
    } else if (isBulk) {
      displayTitle = `${emoji} ${walletName} ${type === 'purchase' ? 'swept' : 'minted'} ${collectionName || tokenName || 'collection'}`;
    } else {
      displayTitle = `${emoji} ${walletName} ${action} ${nftDisplayName}`;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(displayTitle)
      .setTimestamp(new Date(timestamp))
      .setFooter({ text: `⚡ Powered by STPNGPT` });

    // Row 1: Descriptive text
    const walletOpenSeaUrl = `https://opensea.io/${walletAddress}`;
    const walletLink = `[**${walletName}**](${walletOpenSeaUrl})`;
    
    // Create NFT link; use best-effort numeric tokenId
    const tokenIdForUrl = tokenIdNumber !== 'Unknown' ? tokenIdNumber : (tokenId || '0');
    const nftOpenSeaUrl = `https://opensea.io/assets/${chainName.toLowerCase() === 'ethereum' ? 'ethereum' : chainName.toLowerCase()}/${contractAddress}/${tokenIdForUrl}`;
    const nftIdOnlyLink = `[${tokenIdNumber}](${nftOpenSeaUrl})`;
    const nftLink = `[${nftDisplayName}](${nftOpenSeaUrl})`;
    
    // Create collection link using slug if available or fallback to slugified tokenName
    const collectionSlugFromInfo = collectionInfo?.slug;
    const fallbackSlug = (tokenName || '').toString().trim().toLowerCase().replace(/\s+/g, '-');
    const collectionSlug = collectionSlugFromInfo || fallbackSlug || contractAddress;
    const collectionOpenSeaUrl = `https://opensea.io/collection/${collectionSlug}`;
    const collectionLink = `[${collectionName}](${collectionOpenSeaUrl})`;
    
    let descriptionText;
    if (isBulk) {
      const verb = type === 'purchase' ? 'bought' : (type === 'mint' ? 'minted' : 'sold');
      descriptionText = `${walletLink} just ${verb} ${quantity} NFTs from ${collectionLink} collection.`;
    } else {
      if (type === 'purchase') {
        // Single purchase: show full NFT display name (with #ID) as link and collection link
        descriptionText = `${walletLink} just bought ${nftLink} from ${collectionLink} collection.`;
      } else if (type === 'sale' && transactionData.isBidAccepted) {
        // Bid accepted: special description for WETH bid acceptance
        descriptionText = `${walletLink} just accepted a WETH bid for ${nftLink} (${collectionLink} collection).`;
      } else {
        descriptionText = `${walletLink} just ${action} ${nftLink} (${collectionLink} collection).`;
      }
    }
    
    // Add floor price information
    if (floorPriceValue && floorPriceValue > 0) {
      const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
      const formattedFloorPrice = this.formatPrice(floorPriceValue);
      
      descriptionText += ` Current floor price is ${formattedFloorPrice} ${displaySymbol}`;
      
      // Try to get 24h floor price change if available
      if (contractAddress && nftTracker) {
        try {
          const stats = await nftTracker.getCollectionStats(contractAddress, chainName);
          if (stats && stats.one_day_change !== undefined) {
            const change24h = stats.one_day_change;
            const change24hStr = change24h >= 0 ? `+${(change24h * 100).toFixed(1)}%` : `${(change24h * 100).toFixed(1)}%`;
            descriptionText += ` (24h: ${change24hStr})`;
          }
        } catch (error) {
          // Silently ignore floor price change errors
        }
      }
      
      descriptionText += '.';
    }
    
    descriptionText += '\n';
    
    embed.setDescription(descriptionText);

    // Row 1: Price info
    // Purchases and mints: show Buy Price (or Avg Buy Price for bulk)
    if (type === 'purchase' || type === 'mint') {
      let buyPriceDisplay = '-';
      if (type === 'purchase' && price && price > 0 && !isBulk) {
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(price);
        buyPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      } else if (isBulk && totalPrice && quantity) {
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const avg = totalPrice / quantity;
        const formattedPrice = this.formatPrice(avg);
        buyPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      }
      const buyTitle = (isBulk ? '💰 Avg Buy Price' : '💰 Buy Price');
      embed.addFields({ name: buyTitle, value: buyPriceDisplay, inline: true });
    }

    // Sales: show Buy Price, Sell Price and PnL
    if (type === 'sale') {
      // Buy Price (from stored purchase data)
      let buyPriceDisplay = '-';
      if (isBulk && buyPrice && buyPrice > 0) {
        // For bulk sales, use pre-calculated buy price
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(buyPrice);
        buyPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      } else if (buyPrice && buyPrice > 0) {
        // For single sales, use buy price from purchase data
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(buyPrice);
        buyPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      }
      embed.addFields({ name: '💰 Buy Price', value: buyPriceDisplay, inline: true });

      // Sell Price
      let sellPriceDisplay = '-';
      if (isBulk && totalPrice && totalPrice > 0) {
        // For bulk sales, show total price
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(totalPrice);
        sellPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      } else if (price && price > 0) {
        // For single sales, show individual price
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(price);
        sellPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      }
      embed.addFields({ name: '💸 Sell Price', value: sellPriceDisplay, inline: true });

      // PnL
      let pnlValue = '-';
      let pnlEmoji = '🫥';
      
      if (pnl !== undefined && pnlUSD !== undefined && buyPrice > 0) {
        // Use pre-calculated PnL data (both bulk and single sales)
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
        const absPnl = Math.abs(pnl);
        const absUsd = Math.abs(pnlUSD);
        const percentage = (pnl / buyPrice) * 100;

        // ETH line: threshold < 0.0001, otherwise 4 decimals (<1) or 2 decimals (>=1)
        let ethContent;
        if (absPnl < 0.0001) {
          ethContent = `<0.0001 ${displaySymbol}`;
        } else if (absPnl >= 1) {
          ethContent = `${Math.round(absPnl * 100) / 100} ${displaySymbol}`;
        } else {
          ethContent = `${absPnl.toFixed(4)} ${displaySymbol}`;
        }

        // USD line: threshold < $1
        let usdContent;
        if (isNaN(absUsd) || !isFinite(absUsd) || absUsd < 1) {
          usdContent = '<$1';
        } else {
          usdContent = `$${Math.round(absUsd * 100) / 100}`;
        }

        // Percentage line: threshold < 1%
        let percContent;
        if (isNaN(percentage) || !isFinite(percentage) || Math.abs(percentage) < 1) {
          percContent = '<1%';
        } else {
          percContent = `${Math.abs(percentage).toFixed(1)}%`;
        }

        pnlValue = `${sign}${ethContent}\n${sign}${usdContent}\n${sign}${percContent}`;
        pnlEmoji = pnl > 0 ? '🤑' : (pnl < 0 ? '😢' : '🫥');
      } else if (buyPrice && price && buyPrice > 0 && price > 0) {
        // Fallback: calculate PnL from prices if no pre-calculated data
        const calculatedPnl = price - buyPrice;
        const calculatedPnlUSD = (priceUSD || 0) - (buyPriceUSD || 0);
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');

        const sign = calculatedPnl > 0 ? '+' : calculatedPnl < 0 ? '-' : '';
        const absPnl = Math.abs(calculatedPnl);
        const absUsd = Math.abs(calculatedPnlUSD);
        const percentage = (calculatedPnl / buyPrice) * 100;

        // ETH line: threshold < 0.0001, otherwise 4 decimals (<1) or 2 decimals (>=1)
        let ethContent;
        if (absPnl < 0.0001) {
          ethContent = `<0.0001 ${displaySymbol}`;
        } else if (absPnl >= 1) {
          ethContent = `${Math.round(absPnl * 100) / 100} ${displaySymbol}`;
        } else {
          ethContent = `${absPnl.toFixed(4)} ${displaySymbol}`;
        }

        // USD line: threshold < $1
        let usdContent;
        if (isNaN(absUsd) || !isFinite(absUsd) || absUsd < 1) {
          usdContent = '<$1';
        } else {
          usdContent = `$${Math.round(absUsd * 100) / 100}`;
        }

        // Percentage line: threshold < 1%
        let percContent;
        if (isNaN(percentage) || !isFinite(percentage) || Math.abs(percentage) < 1) {
          percContent = '<1%';
        } else {
          percContent = `${Math.abs(percentage).toFixed(1)}%`;
        }

        pnlValue = `${sign}${ethContent}\n${sign}${usdContent}\n${sign}${percContent}`;
        pnlEmoji = calculatedPnl > 0 ? '🤑' : (calculatedPnl < 0 ? '😢' : '🫥');
      }
      embed.addFields({ name: `${pnlEmoji} PnL`, value: pnlValue, inline: true });
    }

    // Row 2: HODL time + Floor price (only for purchase/sale)
    if (type !== 'mint') {
      // HODL time only for sales
      if (type === 'sale') {
        let hodlTime = '-';
        
        if (holdTime && holdTime !== '-') {
          // Use pre-calculated hold time (both bulk and single sales)
          hodlTime = holdTime;
        } else if (buyTimestamp) {
          // Fallback: calculate from timestamps if no pre-calculated data
          const sellTime = new Date(timestamp);
          const buyTime = new Date(buyTimestamp);
          const timeDiffMs = sellTime.getTime() - buyTime.getTime();
          const timeDiffMinutes = timeDiffMs / (1000 * 60);
          const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
          const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
          
          if (timeDiffMinutes < 60) {
            hodlTime = `${Math.floor(timeDiffMinutes)}min`;
          } else if (timeDiffHours < 24) {
            const hours = Math.floor(timeDiffHours);
            const minutes = Math.floor(timeDiffMinutes % 60);
            hodlTime = `${hours}h ${minutes}min`;
          } else {
            const days = Math.floor(timeDiffDays);
            if (days === 1) {
              hodlTime = `${days} day`;
            } else {
              hodlTime = `${days} days`;
            }
          }
        }
        
        embed.addFields({ name: '🕐 Hodl time', value: hodlTime, inline: true });
      }

      // Floor price
      let floorPriceDisplay = '-';
      if (floorPriceValue && floorPriceValue > 0) {
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        floorPriceDisplay = `${this.formatPrice(floorPriceValue)} ${displaySymbol}`;
      }
      
      embed.addFields({ name: '🎯 Floor price', value: floorPriceDisplay, inline: true });
    }

    // Chain information (always show, including mint)
    const chainEmoji = this.getChainEmoji(chainName);
    embed.addFields({ name: `${chainEmoji} Chain`, value: chainName, inline: true });

    // Row 4: NFT Image (if available)
    let displayImageUrl = imageUrl;
    if (!displayImageUrl && collectionInfo) {
      displayImageUrl = collectionInfo.image_url || collectionInfo.banner_image_url || null;
    }
    if (displayImageUrl) {
      embed.setImage(displayImageUrl);
    }

    // Row 6: Links - Twitter | Discord | OpenSea.io | Explorer
    const links = [];
    
    // Get collection info for social links
    let twitterUrl = 'https://twitter.com';
    let discordUrl = 'https://discord.gg';
    let openSeaUrl = 'https://opensea.io';
    let projectUrl = 'https://opensea.io';
    
    if (contractAddress && nftTracker) {
      try {
        // Use slug if available in transaction data, otherwise fall back to contract address
        const collectionSlug = transactionData.tokenName && transactionData.tokenName !== 'Unknown' ? transactionData.tokenName : null;
        const collectionInfo = collectionSlug 
          ? await nftTracker.getCollectionInfoBySlug(collectionSlug, chainName)
          : await nftTracker.getCollectionInfo(contractAddress, chainName);
        if (collectionInfo) {
          // Twitter link
          if (collectionInfo.twitter_username) {
            twitterUrl = `https://twitter.com/${collectionInfo.twitter_username}`;
          }
          
          // Discord link
          if (collectionInfo.discord_url) {
            discordUrl = collectionInfo.discord_url;
          }
          
          // OpenSea link
          if (collectionInfo.opensea_url) {
            openSeaUrl = collectionInfo.opensea_url;
          } else if (collectionInfo.slug) {
            openSeaUrl = `https://opensea.io/collection/${collectionInfo.slug}`;
          } else {
            openSeaUrl = `https://opensea.io/collection/${contractAddress}`;
          }
          
          // Project URL (website)
          if (collectionInfo.project_url) {
            projectUrl = collectionInfo.project_url;
          } else if (collectionInfo.external_url) {
            projectUrl = collectionInfo.external_url;
          }
        }
      } catch (error) {
        console.log(`❌ Error getting collection info: ${error.message}`);
      }
    }
    
    // Add links in new order
    links.push(`[OpenSea](${openSeaUrl})`);
    links.push(`[Twitter](${twitterUrl})`);
    links.push(`[Discord](${discordUrl})`);
    links.push(`[Website](${projectUrl})`);
    
    // Explorer link (always points to the transaction)
    const explorerUrl = this.getExplorerUrl(chainName, transactionHash, 'tx');
    links.push(`[Explorer](${explorerUrl})`);

    // Add links directly
    embed.addFields({ name: '\u200b', value: links.join(' | '), inline: false });

    return embed;
  }

  getChainEmoji(chainName) {
    const chainEmojis = {
      'Ethereum': '🔵',
      'Base': '🔷',
      'Polygon': '🟣',
      'Arbitrum': '🔵',
      'Optimism': '🔴',
      'BSC': '🟡',
      'Avalanche': '❄️',
      'Berachain': '🐻',
      'Abstract': '💎'
    };
    
    return chainEmojis[chainName] || '🔗';
  }

  getExplorerUrl(chainName, hash, type = 'tx') {
    const explorers = {
      'ethereum': { tx: `https://etherscan.io/tx/${hash}`, address: `https://etherscan.io/address/${hash}` },
      'base': { tx: `https://basescan.org/tx/${hash}`, address: `https://basescan.org/address/${hash}` },
      'berachain': { tx: `https://berascan.com/tx/${hash}`, address: `https://berascan.com/address/${hash}` },
      'abstract': { tx: `https://abstract.money/tx/${hash}`, address: `https://abstract.money/address/${hash}` },
      'polygon': { tx: `https://polygonscan.com/tx/${hash}`, address: `https://polygonscan.com/address/${hash}` },
      'arbitrum': { tx: `https://arbiscan.io/tx/${hash}`, address: `https://arbiscan.io/address/${hash}` },
      'optimism': { tx: `https://optimistic.etherscan.io/tx/${hash}`, address: `https://optimistic.etherscan.io/address/${hash}` },
      'avalanche': { tx: `https://snowtrace.io/tx/${hash}`, address: `https://snowtrace.io/address/${hash}` },
      'bsc': { tx: `https://bscscan.com/tx/${hash}`, address: `https://bscscan.com/address/${hash}` }
    };
    const chainExplorers = explorers[chainName.toLowerCase()] || explorers.ethereum;
    return chainExplorers[type] || chainExplorers.tx;
  }

  isPaperHands(transactionData) {
    // Check if this is a sale with buy price and timestamp
    if (transactionData.type !== 'sale' || !transactionData.buyPrice || !transactionData.buyTimestamp) {
      return false;
    }

    // Calculate time difference in hours
    const sellTime = new Date(transactionData.timestamp);
    const buyTime = new Date(transactionData.buyTimestamp);
    const timeDiffHours = (sellTime - buyTime) / (1000 * 60 * 60);

    // Calculate loss percentage
    const lossPercentage = ((transactionData.buyPrice - transactionData.price) / transactionData.buyPrice) * 100;

    // Paper hands: sold within 48 hours with >20% loss
    return timeDiffHours <= 48 && lossPercentage > 20;
  }

  formatPrice(price) {
    if (!price || price <= 0) return '0';
    
    // For prices >= 1, show 2 decimal places
    if (price >= 1) {
      return Math.round(price * 100) / 100;
    }
    
    // For prices < 1, show max 5 decimal places
    return price.toFixed(5).replace(/\.?0+$/, '');
  }

  async disconnect() {
    if (this.commandManager) {
      await this.commandManager.cleanup();
    }
    if (this.client) {
      await this.client.destroy();
      console.log('🔌 Discord bot disconnected');
    }
  }
}

module.exports = DiscordNotifier; 