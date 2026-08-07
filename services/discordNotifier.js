const { Client, GatewayIntentBits, EmbedBuilder, Events, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const CommandManager = require('./commandManager');
const CryptoPriceService = require('./cryptoPriceService');
const ChannelManager = require('./channelManager');
const AlertsMonitor = require('./alertsMonitor');
const AlertsDatabase = require('./alertsDatabase');

// Shared chain handling - unmapped chains keep their raw OpenSea slug and get
// no block explorer link at all, instead of a wrong etherscan one.
const { toOpenSeaChain, getExplorerUrl } = require('../utils/chains');

// Shared PnL / hold time formatting, so the two PnL branches below and the
// hold time copies in nftTracker cannot drift apart again.
const { formatPnl, formatHoldTime } = require('../utils/format');

class DiscordNotifier {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    this.isReady = false;
    
    // Create shared AlertsDatabase instance
    this.alertsDatabase = new AlertsDatabase();
    
    this.commandManager = new CommandManager(this.alertsDatabase);
    this.cryptoPriceService = new CryptoPriceService();
    this.channelManager = new ChannelManager(this.client);
    this.alertsMonitor = new AlertsMonitor(this, this.alertsDatabase);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`🤖 Discord bot logged in as ${this.client.user.tag}`);
      this.isReady = true;
      
      // Initialize command manager (includes alerts database)
      await this.commandManager.initialize();
      try {
        const loaded = this.commandManager.getCommands?.() || [];
        const names = Array.isArray(loaded)
          ? loaded.map(c => c.name).join(', ')
          : '(unknown)';
        console.log(`🧩 Commands initialized: ${names || '(none)'}`);
      } catch {}
      
      // Initialize alerts monitor
      await this.alertsMonitor.initialize();
      
      // Register slash commands (global + per guild for instant availability)
      await this.registerSlashCommands();
      
      // Initialize channel manager
      const guildId = this.client.guilds.cache.first()?.id;
      if (guildId) {
        await this.channelManager.initialize(guildId);
      }
      
      // Start crypto price service
      this.cryptoPriceService.startService(this.client);
    });

    this.client.on('error', (error) => {
      console.error('❌ Discord bot error:', error);
    });

    // Ensure commands are installed when the bot joins a new guild
    this.client.on('guildCreate', async (guild) => {
      try {
        const commands = this.commandManager.getCommands();
        const result = await guild.commands.set(commands);
        console.log(`✅ Registered ${result.size} guild slash commands for new guild: ${guild.name} (${guild.id})`);
      } catch (error) {
        console.error(`❌ Failed to register slash commands for new guild ${guild?.name} (${guild?.id}):`, error);
      }
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
      
      // Wait for the bot to be ready AND commands to be initialized
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Discord bot connection timeout'));
        }, 30000); // 30 second timeout
        
        // Wait for full initialization (commands + alerts) to complete
        this.client.once('ready', async () => {
          try {
            clearTimeout(timeout);
            console.log(`🤖 Discord bot logged in as ${this.client.user.tag}`);
            this.isReady = true;
            
            // Wait a moment for all initialization to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            resolve();
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
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
      // Get all commands from command manager
      const commands = this.commandManager.getCommands();

      // Skip re-registration when the command definitions haven't changed,
      // to avoid burning Discord's rate limit on every restart.
      const hashPath = path.join(__dirname, '..', 'data', '.commands-hash');
      const currentHash = crypto.createHash('sha256')
        .update(JSON.stringify(commands))
        .digest('hex');
      try {
        const previousHash = fs.readFileSync(hashPath, 'utf8').trim();
        if (previousHash === currentHash) {
          console.log('✅ Slash command definitions unchanged, skipping registration');
          return;
        }
      } catch {}

      console.log('🔧 Registering slash commands (guild-scoped, clearing globals to avoid duplicates)...');

      // Clear GLOBAL commands to prevent duplicates with guild-scoped commands
      try {
        await this.client.application.commands.set([]);
        console.log('🧹 Cleared global slash commands');
      } catch (clearErr) {
        console.log(`⚠️ Could not clear global commands: ${clearErr.message}`);
      }

      // Register per-guild for instant availability
      const guilds = this.client.guilds.cache;
      if (guilds && guilds.size > 0) {
        for (const [guildId, guild] of guilds) {
          try {
            const result = await guild.commands.set(commands);
            console.log(`✅ Registered ${result.size} guild slash commands (instant) for ${guild.name} (${guildId})`);
          } catch (e) {
            console.log(`⚠️ Failed to register guild commands for ${guild?.name} (${guildId}): ${e.message}`);
          }
        }
      } else {
        console.log('⚠️ No guilds in cache during command registration.');
      }

      try {
        fs.mkdirSync(path.dirname(hashPath), { recursive: true });
        fs.writeFileSync(hashPath, currentHash);
      } catch (writeErr) {
        console.log(`⚠️ Could not persist command hash: ${writeErr.message}`);
      }
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
      const targets = config.discord.channelIds || [];
      if (targets.length === 0) {
        console.error('❌ No DISCORD_CHANNEL_ID configured');
        return;
      }

      const embed = await this.createEmbed(transactionData, nftTracker);

      // Optional role mention for bulk purchase sweeps. Gated on
      // config.discord.rolePingMinItems, which is 0 (disabled) by default -
      // set NFT_ROLE_PING_MIN_ITEMS to re-enable at whatever size is useful.
      let content = undefined;
      const pingMin = Number(config.discord.rolePingMinItems) || 0;
      if (
        pingMin > 0 &&
        config.discord.nftsRoleId &&
        transactionData.type === 'purchase' &&
        transactionData.isBulk === true &&
        Number(transactionData.quantity) >= pingMin
      ) {
        content = `<@&${config.discord.nftsRoleId}>`;
      }

      // One unreachable channel must not silence the others, so each target is
      // isolated - a missing channel or a revoked permission in one server
      // still lets the rest of them receive the notification.
      let delivered = 0;
      for (const channelId of targets) {
        try {
          const channel = await this.client.channels.fetch(channelId);
          if (!channel) {
            console.error(`❌ Discord channel ${channelId} not found`);
            continue;
          }
          await channel.send({ content, embeds: [embed] });
          delivered++;
        } catch (error) {
          console.error(`❌ Could not post to channel ${channelId}: ${error.message}`);
        }
      }

      if (delivered === 0) {
        console.error(`❌ Notification for ${transactionData.type} reached no channel`);
      } else {
        console.log(`📨 Discord notification sent for ${transactionData.type} (${delivered}/${targets.length} channels)`);
      }
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

    // Collection info: prefer what the tracker already fetched. Refetching it here
    // (once for the name, once for the social links) cost 3+ extra OpenSea calls
    // per notification. Only fall back to a lookup when it wasn't supplied.
    let collectionInfo = transactionData.collectionInfo || null;
    let collectionName = tokenName;
    let floorPriceValue = floorPrice;

    if (!collectionInfo && contractAddress && nftTracker) {
      try {
        // Try to get collection info for better name and floor price
        const collectionSlug = tokenName && tokenName !== 'Unknown' ? tokenName : null;
        collectionInfo = collectionSlug
          ? await nftTracker.getCollectionInfoBySlug(collectionSlug, chainName)
          : await nftTracker.getCollectionInfo(contractAddress, chainName);
      } catch (error) {
        console.log(`⚠️ Error getting collection info for display: ${error.message}`);
      }
    }

    if (collectionInfo && collectionInfo.name) {
      collectionName = collectionInfo.name;
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
      .setFooter({ text: '⚡ by STPN (@cryptostpn on X)' });

    // Row 1: Descriptive text
    const walletOpenSeaUrl = `https://opensea.io/${walletAddress}`;
    const walletLink = `[**${walletName}**](${walletOpenSeaUrl})`;
    
    // Create NFT link; use best-effort numeric tokenId
    const tokenIdForUrl = tokenIdNumber !== 'Unknown' ? tokenIdNumber : (tokenId || '0');
    
    // Map chain names to OpenSea URL chain identifiers
    const openSeaChainId = toOpenSeaChain(chainName);

    const nftOpenSeaUrl = `https://opensea.io/assets/${openSeaChainId}/${contractAddress}/${tokenIdForUrl}`;
    const nftIdOnlyLink = `[${tokenIdNumber}](${nftOpenSeaUrl})`;
    const nftLink = `[${nftDisplayName}](${nftOpenSeaUrl})`;
    
    // Create collection link using slug if available or fallback to slugified tokenName
    const collectionSlugFromInfo = collectionInfo?.slug;
    const fallbackSlug = (tokenName || '').toString().trim().toLowerCase().replace(/\s+/g, '-');
    const collectionSlug = collectionSlugFromInfo || fallbackSlug || contractAddress;
    // fallbackSlug derives from tokenName, which on bulk paths can be an NFT name
    // like "Cool Cat #123" — encode it so it can't break out of the markdown link.
    const collectionOpenSeaUrl = `https://opensea.io/collection/${encodeURIComponent(collectionSlug)}`;
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
      descriptionText += '.';
    }
    
    descriptionText += '\n';
    
    embed.setDescription(descriptionText);

    // Row 1: Price info
    // Purchases: show Buy Price (or Avg Buy Price for bulk)
    if (type === 'purchase') {
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

    // Mints: per-item mint price, how many were minted and the total paid.
    // A free mint is the common case, so 0 reads as "Free", not "-".
    if (type === 'mint') {
      const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
      const mintQuantity = Number(quantity) > 0 ? Number(quantity) : 1;
      // Bulk mints carry totalPrice, single mints carry price.
      const mintTotal = Number(totalPrice ?? price ?? 0) || 0;
      const mintTotalUSD = Number(totalPriceUSD ?? priceUSD ?? 0) || 0;

      embed.addFields({
        name: '🪙 Mint price',
        value: this.formatMintAmount(mintTotal / mintQuantity, mintTotalUSD / mintQuantity, displaySymbol),
        inline: true
      });
      embed.addFields({ name: '🔢 Quantity', value: String(mintQuantity), inline: true });
      embed.addFields({
        name: '💰 Total',
        value: this.formatMintAmount(mintTotal, mintTotalUSD, displaySymbol),
        inline: true
      });
    }

    // Sales: show Buy Price, Sell Price and PnL
    if (type === 'sale') {
      // Buy Price (from stored purchase data). 0 means the wallet minted it
      // for free - a known basis, shown as "Free"; only an absent basis is "-".
      let buyPriceDisplay = '-';
      if (Number.isFinite(buyPrice) && buyPrice > 0) {
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        buyPriceDisplay = `${this.formatPrice(buyPrice)} ${displaySymbol}`;
      } else if (buyPrice === 0) {
        buyPriceDisplay = 'Free';
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
      
      // buyPrice of 0 is a real cost basis - a free mint - not missing data,
      // so it must produce a PnL. Only the percentage is undefined against a
      // zero basis, and that line is dropped rather than shown as infinity.
      if (pnl !== undefined && pnlUSD !== undefined && Number.isFinite(buyPrice) && buyPrice >= 0) {
        // Use pre-calculated PnL data (both bulk and single sales)
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formatted = formatPnl({ pnl, pnlUSD, buyPrice, symbol: displaySymbol });
        pnlValue = formatted.value;
        pnlEmoji = formatted.emoji;
      } else if (buyPrice && price && buyPrice > 0 && price > 0) {
        // Fallback: calculate PnL from prices if no pre-calculated data. The USD
        // side falls back to 0 on either leg, so it can read <$1 while the
        // native amount is real.
        const displaySymbol = (nativeSymbol === 'WETH') ? 'ETH' : (nativeSymbol || 'ETH');
        const formatted = formatPnl({
          pnl: price - buyPrice,
          pnlUSD: (priceUSD || 0) - (buyPriceUSD || 0),
          buyPrice,
          symbol: displaySymbol
        });
        pnlValue = formatted.value;
        pnlEmoji = formatted.emoji;
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
          // Fallback: calculate from timestamps if no pre-calculated data.
          // Buy and sale in the same second is a real flip, shown as 0min.
          const sellTime = new Date(timestamp);
          const buyTime = new Date(buyTimestamp);
          const timeDiffMs = sellTime.getTime() - buyTime.getTime();
          hodlTime = timeDiffMs === 0 ? '0min' : formatHoldTime(timeDiffMs);
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
    
    // Reuse the single collection info object resolved at the top of this method.
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
    
    // Add links in new order
    links.push(`[OpenSea](${openSeaUrl})`);
    links.push(`[Twitter](${twitterUrl})`);
    links.push(`[Discord](${discordUrl})`);
    links.push(`[Website](${projectUrl})`);
    
    // Explorer link (points to the transaction). Omitted when the chain has no
    // known explorer - a wrong etherscan link is worse than no link.
    const explorerUrl = this.getExplorerUrl(chainName, transactionHash, 'tx');
    if (explorerUrl) {
      links.push(`[Explorer](${explorerUrl})`);
    }

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
    return getExplorerUrl(chainName, hash, type);
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

  /**
   * Native amount for a mint field, with the USD equivalent underneath when a
   * rate was available. Zero is a free mint, not missing data.
   */
  formatMintAmount(amount, amountUSD, displaySymbol) {
    if (!amount || !isFinite(amount) || amount <= 0) return 'Free';

    const nativeLine = `${this.formatPrice(amount)} ${displaySymbol}`;
    if (!amountUSD || !isFinite(amountUSD) || amountUSD <= 0) return nativeLine;

    const usdLine = amountUSD < 1 ? '<$1' : `$${Math.round(amountUSD * 100) / 100}`;
    return `${nativeLine}\n${usdLine}`;
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
    if (this.cryptoPriceService) {
      this.cryptoPriceService.stopService();
    }
    if (this.alertsMonitor) {
      this.alertsMonitor.stop();
    }
    if (this.commandManager) {
      await this.commandManager.cleanup();
    }
    if (this.client) {
      await this.client.destroy();
      console.log('🔌 Discord bot disconnected');
    }
  }

  getChannelManager() {
    return this.channelManager;
  }

  getAlertsMonitor() {
    return this.alertsMonitor;
  }

  getClient() {
    return this.client;
  }
}

module.exports = DiscordNotifier; 