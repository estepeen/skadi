const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fetch = require('node-fetch');
const config = require('../config');
const CryptoPriceService = require('./cryptoPriceService');
const registry = require('./registry');
// The key can be an auto-minted free one that rotates at runtime, so it has to
// be read per request instead of captured from the env at load time.
const { getCurrentKey } = require('../utils/openseaKey');

function openseaHeaders() {
  return {
    'Accept': 'application/json',
    'X-API-KEY': getCurrentKey() || ''
  };
}

class CollectionCommand {
  constructor() {
    // No need to initialize NFTTracker for this command
    this.cryptoPriceService = new CryptoPriceService();
    // Every invocation costs 2-4 OpenSea calls plus a CoinGecko call, so one
    // member spamming the command can exhaust the shared API budget
    this.lastInvocation = new Map(); // userId -> timestamp
    this.COOLDOWN_MS = 10 * 1000; // 10 seconds
  }

  // Returns the milliseconds left on the caller's cooldown (0 when free to go)
  // and prunes expired entries so the Map cannot grow without bound
  checkCooldown(userId) {
    const now = Date.now();

    for (const [id, timestamp] of this.lastInvocation) {
      if (now - timestamp >= this.COOLDOWN_MS) {
        this.lastInvocation.delete(id);
      }
    }

    const last = this.lastInvocation.get(userId);
    if (last != null) {
      return this.COOLDOWN_MS - (now - last);
    }

    this.lastInvocation.set(userId, now);
    return 0;
  }

  getCommandData() {
    return new SlashCommandBuilder()
      .setName('check')
      .setDescription('Check NFT collections and tokens')
      .addSubcommand(subcommand =>
        subcommand
          .setName('collection')
          .setDescription('Shows overview of OpenSea collection by slug')
          .addStringOption(option =>
            option.setName('slug')
              .setDescription('Collection slug (e.g. tiny-buds40x40)')
              .setRequired(true)
          )
          .addStringOption(option =>
            option.setName('chain')
              .setDescription('Blockchain network')
              .setRequired(false)
              .addChoices(
                { name: 'Base', value: 'base' },
                { name: 'Ethereum', value: 'ethereum' },
                { name: 'ApeChain', value: 'ape_chain' },
                { name: 'Berachain', value: 'berachain' },
                { name: 'Polygon', value: 'polygon' },
                { name: 'Arbitrum', value: 'arbitrum' },
                { name: 'Optimism', value: 'optimism' }
              )
          )
      );
  }

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      if (sub !== 'collection') {
        await interaction.reply({ content: '❌ Unknown check subcommand.', flags: MessageFlags.Ephemeral });
        return;
      }

      const slug = interaction.options.getString('slug', true);
      const chain = interaction.options.getString('chain') || 'ethereum';

      // Validate before anything reaches an OpenSea URL
      if (!this.isValidSlug(slug)) {
        await interaction.reply({
          content: `❌ **Invalid collection slug**: \`${slug}\`\nSlugs may only contain letters, numbers and dashes.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const remainingMs = this.checkCooldown(interaction.user.id);
      if (remainingMs > 0) {
        await interaction.reply({
          content: `⏳ Slow down - you can use \`/check collection\` again in ${Math.ceil(remainingMs / 1000)}s.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Acknowledge within Discord's 3s window - the fetches below take longer
      await interaction.deferReply();

      console.log(`🔍 Collection command executed for: ${slug} on ${chain}`);
      console.log(`🔍 Fetching collection from: https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`);
      console.log(`🔍 Fetching stats from: https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}/stats`);

      // 1) Collection detail (name, fees, total_supply, odkazy)
      const colRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`, {
        headers: openseaHeaders()
      });

      console.log(`🔍 Collection response status: ${colRes.status} ${colRes.statusText}`);
      if (!colRes.ok) {
        throw new Error(`Get Collection failed: ${colRes.status} ${colRes.statusText}`);
      }
      const collection = await colRes.json();

      // 2) Stats (floor, volume, holders)
      const statsRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}/stats`, {
        headers: openseaHeaders()
      });

      console.log(`🔍 Stats response status: ${statsRes.status} ${statsRes.statusText}`);
      if (!statsRes.ok) {
        throw new Error(`Get Collection Stats failed: ${statsRes.status} ${statsRes.statusText}`);
      }
      const stats = await statsRes.json();

      // --- Parsing per user requirements ---
      const name = collection?.name ?? slug;
      const createdDate = collection?.created_date ?? null;
      const totalSupply = collection?.total_supply ?? null;
      const description = collection?.description ?? null;
      const fees = Array.isArray(collection?.fees) ? collection.fees : [];

      // Royalties - creator fees (required = false)
      const creatorFees = fees.filter(f => f && f.recipient && f.required === false);
      // Platform fees (required = true)
      const platformFees = fees.filter(f => f && f.required === true);
      
      // If no creator fees found in fees array, try alternative methods
      if (creatorFees.length === 0) {
        console.log(`🔍 No creator fees found in fees array, trying alternative methods...`);
        
        // Try to get creator fees from the shared NFTTracker instance
        try {
          const nftTracker = registry.getNFTTracker();

          if (!nftTracker) {
            console.log('⚠️ NFTTracker not available, skipping creator fees fallback');
          } else {
            const creatorFeesInfo = await nftTracker.getCollectionCreatorFees(slug, chain);

            if (creatorFeesInfo && creatorFeesInfo.percentage !== null) {
              // Create a synthetic creator fee entry
              creatorFees.push({
                fee: creatorFeesInfo.percentage,
                recipient: 'Creator',
                required: false
              });
              console.log(`✅ Found creator fees via NFTTracker: ${creatorFeesInfo.percentage}%`);
            }
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch creator fees via NFTTracker: ${error.message}`);
        }
      }

      // Stats data
      const floor = stats?.total?.floor_price ?? null;
      const totalVolume = stats?.total?.volume ?? null;
      const totalSales = stats?.total?.sales ?? null;
      const holders = stats?.total?.num_owners ?? null;
      const marketCap = stats?.total?.market_cap ?? null;
      const averagePrice = stats?.total?.average_price ?? null;

      // Convert market cap to USD if available
      let marketCapUSD = null;
      if (marketCap !== null && marketCap !== undefined) {
        try {
          const cryptoPrices = await this.cryptoPriceService.fetchPrices();
          const ethPrice = cryptoPrices['ETH']?.price;
          if (ethPrice) {
            marketCapUSD = marketCap * ethPrice;
            console.log(`🔍 Market cap conversion: ${marketCap} ETH × $${ethPrice} = $${marketCapUSD.toLocaleString()}`);
          }
        } catch (error) {
          console.log(`⚠️ Could not convert market cap to USD: ${error.message}`);
        }
      }

      // Time intervals
      const intervals = stats?.intervals ?? [];
      const oneDay = intervals.find(i => i.interval === 'one_day');
      const sevenDay = intervals.find(i => i.interval === 'seven_day');
      const thirtyDay = intervals.find(i => i.interval === 'thirty_day');

      // Formatting helpers
      const fmt = (n) => {
        if (n === null || n === undefined) return '—';
        if (typeof n === 'number') {
          if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
          if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
          return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
        }
        return '—';
      };

      // Get native token symbol for the chain
      const getNativeSymbol = (chainName) => {
        const symbols = {
          'ethereum': 'ETH',
          'ape_chain': 'APE',
          'berachain': 'BERA',
          'base': 'ETH',
          'polygon': 'MATIC',
          'arbitrum': 'ETH',
          'optimism': 'ETH'
        };
        return symbols[chainName.toLowerCase()] || 'ETH';
      };

      const nativeSymbol = getNativeSymbol(chain);

      const fmtEth = (n) => {
        if (n === null || n === undefined) return '—';
        if (typeof n === 'number') {
          // For prices below 0.01 show 4 decimal places
          if (n < 0.01) {
            return `${n.toFixed(4)} ${nativeSymbol}`;
          }
          // For higher prices show 2 decimal places
          return `${n.toFixed(2)} ${nativeSymbol}`;
        }
        return '—';
      };

      const feeList = (arr) => {
        if (!arr.length) return '—';
        return arr
          .map(f => `${typeof f.fee === 'number' ? f.fee : '—'}% (${f.required ? 'enforced' : 'optional'})`)
          .join('\n');
      };

      // Create embed per user requirements
      const embed = new EmbedBuilder()
        .setTitle(`📊 Collection ${name}`)
        .setURL(`https://opensea.io/collection/${slug}`)
        .setColor(0x00bfff);

      // Description under the title (plain text, no field name)
      if (description) {
        const shortDesc = description.length > 1024
          ? description.substring(0, 1021) + '...'
          : description;
        embed.setDescription(shortDesc);
      }

      // Row 1
      embed.addFields(
        { name: '🎯 Floor Price', value: fmtEth(floor), inline: true },
        { name: '🪙 Creators Fee', value: feeList(creatorFees), inline: true },
        { name: '🔢 Total Supply', value: fmt(totalSupply), inline: true }
      );

      // Row 2
      embed.addFields(
        { name: '📊 Average Price', value: fmtEth(averagePrice), inline: true },
        { name: '👥 Unique Holders', value: fmt(holders), inline: true },
        { name: '🔷 Chain', value: chain.toUpperCase(), inline: true }
      );

      // Row 3
      embed.addFields(
        { name: '📈 Total Volume', value: `${fmtEth(totalVolume)} (${fmt(totalSales)} sales)`, inline: true },
        { name: '💎 Market Cap', value: marketCapUSD ? `$${fmt(marketCapUSD)}` : fmtEth(marketCap), inline: true },
        { name: '📅 Created', value: createdDate || '—', inline: true }
      );

      // Volume Intervals (shortened to Volume)
      embed.addFields(
        { name: '⏰ Volume', value: 
          `1d: ${fmtEth(oneDay?.volume)} (${fmt(oneDay?.sales)} sales)\n` +
          `7d: ${fmtEth(sevenDay?.volume)} (${fmt(sevenDay?.sales)} sales)\n` +
          `30d: ${fmtEth(thirtyDay?.volume)} (${fmt(thirtyDay?.sales)} sales)`, 
          inline: false 
        }
      );



      embed.setFooter({ text: `⚡ Powered by STPN (@cryptostpn on X) • /check collection ${slug}` })
        .setTimestamp();

      // Thumbnail
      if (collection?.image_url) {
        embed.setThumbnail(collection.image_url);
      }

      // Social links
      const socialLinks = [];
      if (collection?.project_url) {
        socialLinks.push(`[🌐 Website](${collection.project_url})`);
      }
      if (collection?.twitter_username) {
        socialLinks.push(`[🐦 Twitter](https://twitter.com/${collection.twitter_username})`);
      }
      if (collection?.discord_url) {
        socialLinks.push(`[🎮 Discord](${collection.discord_url})`);
      }
      if (socialLinks.length > 0) {
        embed.addFields({ name: '🔗 Social Links', value: socialLinks.join(' • '), inline: false });
      }

      // Send the response directly
      try {
        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Collection command completed successfully for ${slug}`);
      } catch (replyError) {
        console.error('❌ Could not send response:', replyError.message);
        // Fall back to a private summary: editReply cannot be made ephemeral
        // after a public defer, so drop the placeholder and follow up privately
        try {
          await interaction.deleteReply().catch(() => {});
          await interaction.followUp({
            content: `📊 **Collection ${name}**\n🎯 Floor: ${fmtEth(floor)}\n🪙 Creator Fee: ${feeList(creatorFees)}\n🔢 Supply: ${fmt(totalSupply)}`,
            flags: MessageFlags.Ephemeral
          });
        } catch (fallbackError) {
          console.error('❌ Could not send fallback response:', fallbackError.message);
        }
      }

    } catch (error) {
      console.error('❌ Error in collection command:', error);
      // A throw without .message must not turn this handler into a new TypeError
      const msg = String(error?.message ?? error);
      let errorMessage = '❌ An error occurred while loading collection information.';
      if (msg.includes('rate limit') || msg.includes('429')) {
        errorMessage = '⚠️ OpenSea API rate limit reached. Please try again later.';
      } else if (msg.includes('404') || msg.includes('not found')) {
        errorMessage = '❌ Collection not found. Please check the collection name.';
      } else if (msg.includes('401') || msg.includes('unauthorized')) {
        errorMessage = '❌ OpenSea API authentication error. Please check your API key.';
      }
      
      // Try to send error message privately. deferReply() itself is inside the
      // try above, so the interaction may not be acknowledged at all yet.
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.deleteReply().catch(() => {});
          await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error('❌ Could not send error message:', replyError.message);
      }
    }
  }

  isValidSlug(slug) {
    return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/i.test(slug);
  }

  async disconnect() {
    // No cleanup needed for this command
  }
}

module.exports = CollectionCommand;
