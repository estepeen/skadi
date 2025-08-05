const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('../config');

class DiscordNotifier {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    this.isReady = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('ready', () => {
      console.log(`🤖 Discord bot logged in as ${this.client.user.tag}`);
      this.isReady = true;
    });

    this.client.on('error', (error) => {
      console.error('❌ Discord bot error:', error);
    });
  }

  async connect() {
    try {
      await this.client.login(config.discord.botToken);
      console.log('🔗 Connecting to Discord...');
    } catch (error) {
      console.error('❌ Failed to connect to Discord:', error.message);
      throw error;
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
      await channel.send({ embeds: [embed] });
      
      console.log(`📨 Discord notification sent for ${transactionData.type}`);
    } catch (error) {
      console.error('❌ Failed to send Discord notification:', error.message);
    }
  }

  async createEmbed(transactionData, nftTracker = null) {
    const {
      type, walletName, walletAddress, fromAddress, toAddress, tokenName, tokenId, contractAddress,
      transactionHash, chainName, timestamp, price, priceUSD, totalPrice, totalPriceUSD,
      quantity = 1, imageUrl, nftName, nativeSymbol, floorPrice, buyPrice, buyPriceUSD, isSweep = false, buyTimestamp
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
        if (quantity >= 4) {
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
      case 'mint': color = 0x0099ff; action = 'minted'; emoji = '🔵'; break;
      default: color = 0x0099ff; action = 'transacted'; emoji = '🔵';
    }

    // Convert hex token ID to decimal number
    const tokenIdNumber = tokenId ? parseInt(tokenId, 16) : 'Unknown';
    
    // Create display name with collection name and token ID
    let nftDisplayName;
    if (nftName && nftName !== 'Unknown') {
      nftDisplayName = nftName;
    } else if (collectionName && collectionName !== 'Unknown') {
      nftDisplayName = `${collectionName} #${tokenIdNumber}`;
    } else {
      nftDisplayName = `NFT #${tokenIdNumber}`;
    }
    
    const displayTitle = `${emoji} ${walletName} ${action} ${nftDisplayName}`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(displayTitle)
      .setTimestamp(new Date(timestamp))
      .setFooter({ text: `⚡ Powered by STPNGPT` });

    // Row 1: Descriptive text
    const walletOpenSeaUrl = `https://opensea.io/${walletAddress}`;
    const walletLink = `[**${walletName}**](${walletOpenSeaUrl})`;
    
    // Create NFT link
    const nftOpenSeaUrl = `https://opensea.io/assets/${chainName.toLowerCase() === 'ethereum' ? 'ethereum' : chainName.toLowerCase()}/${contractAddress}/${tokenId}`;
    const nftLink = `[${nftDisplayName}](${nftOpenSeaUrl})`;
    
    // Create collection link
    const collectionOpenSeaUrl = `https://opensea.io/collection/${tokenName}`;
    const collectionLink = `[${collectionName}](${collectionOpenSeaUrl})`;
    
    let descriptionText = `${walletLink} just ${action} ${nftLink} (${collectionLink} collection).`;
    
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

    // Row 1: Buy Price + Sell Price + PnL (3 per row) - only for purchase/sale
    if (type !== 'mint') {
      // Buy Price (show for purchases, show buy price for sales if available)
      let buyPriceDisplay = '-';
      if (type === 'purchase' && price && price > 0) {
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(price);
        buyPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      } else if (type === 'sale' && buyPrice && buyPrice > 0) {
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formattedPrice = this.formatPrice(buyPrice);
        buyPriceDisplay = `${formattedPrice} ${displaySymbol}`;
      }
      
      embed.addFields({ name: '💰 Buy Price', value: buyPriceDisplay, inline: true });

      // Sell Price (only for sales)
      if (type === 'sale') {
        let sellPriceDisplay = '-';
        if (price && price > 0) {
          const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
          const formattedPrice = this.formatPrice(price);
          sellPriceDisplay = `${formattedPrice} ${displaySymbol}`;
        }
        
        embed.addFields({ name: '💸 Sell Price', value: sellPriceDisplay, inline: true });

        // Calculate PnL for sales
        let pnlValue = '-';
        let pnlEmoji = '🫥'; // Dotted line face for no PnL
        
        if (buyPrice && price && buyPrice > 0 && price > 0) {
          const pnl = price - buyPrice;
          const pnlUSD = priceUSD - buyPriceUSD;
          const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
          
          // Format PnL with proper rounding - use < symbol for small amounts
          let formattedPnl;
          let formattedPnlUSD;
          let percentageText;
          
          if (Math.abs(pnl) < 0.001) {
            formattedPnl = '<0.001';
          } else if (Math.abs(pnl) >= 1) {
            formattedPnl = Math.round(pnl * 100) / 100;
          } else {
            formattedPnl = pnl.toFixed(4);
          }
          
                  if (isNaN(pnlUSD) || Math.abs(pnlUSD) < 1) {
          formattedPnlUSD = '<$1';
        } else {
          formattedPnlUSD = Math.round(pnlUSD * 100) / 100;
        }
          
          // Format percentage
          const percentage = (pnl / buyPrice) * 100;
          if (Math.abs(percentage) < 1) {
            percentageText = '<1%';
          } else {
            percentageText = percentage > 0 ? `+${percentage.toFixed(1)}%` : `${percentage.toFixed(1)}%`;
          }
          
          if (pnl > 0) {
            pnlValue = `+${formattedPnl} ${displaySymbol} (+$${formattedPnlUSD})\n${percentageText}`;
            pnlEmoji = '🤑'; // Money eyes for profit
          } else if (pnl < 0) {
            pnlValue = `${formattedPnl} ${displaySymbol} (-$${Math.abs(formattedPnlUSD)})\n${percentageText}`;
            pnlEmoji = '😢'; // Crying face for loss
          } else {
            pnlValue = `0.0000 ${displaySymbol} ($0.00)\n0.0%`;
            pnlEmoji = '🫥'; // Dotted line face for no change
          }
        } else {
          // No PnL calculation possible - show dash
          pnlValue = '-';
          pnlEmoji = '🫥'; // Dotted line face
        }
        
        // Add PnL
        embed.addFields({ name: `${pnlEmoji} PnL`, value: pnlValue, inline: true });
      }
    }

    // Row 2: HODL time + Floor price + Chain (3 per row) - only for purchase/sale
    if (type !== 'mint') {
      // HODL time only for sales
      if (type === 'sale') {
        let hodlTime = '-';
        if (buyTimestamp) {
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

      // Chain information
      const chainEmoji = this.getChainEmoji(chainName);
      embed.addFields({ name: `${chainEmoji} Chain`, value: chainName, inline: true });
    }

    // Row 4: NFT Image (if available)
    if (imageUrl) {
      embed.setImage(imageUrl);
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
    if (this.client) {
      await this.client.destroy();
      console.log('🔌 Discord bot disconnected');
    }
  }
}

module.exports = DiscordNotifier; 