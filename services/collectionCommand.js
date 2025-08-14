const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const config = require('../config');

class CollectionCommand {
  constructor() {
    // No need to initialize NFTTracker for this command
  }

  getCommandData() {
    return new SlashCommandBuilder()
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
            { name: 'Polygon', value: 'polygon' },
            { name: 'Arbitrum', value: 'arbitrum' },
            { name: 'Optimism', value: 'optimism' }
          )
      );
  }

  async execute(interaction) {
    try {
      const slug = interaction.options.getString('slug', true);
      const chain = interaction.options.getString('chain') || 'base';

      console.log(`🔍 Collection command executed for: ${slug} on ${chain}`);

      // Don't defer reply - we'll reply directly when ready

      // 1) Collection detail (name, fees, total_supply, odkazy)
      const colRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`, {
        headers: {
          'Accept': 'application/json',
          'X-API-KEY': config.opensea.apiKey
        }
      });

      if (!colRes.ok) {
        throw new Error(`Get Collection failed: ${colRes.status} ${colRes.statusText}`);
      }
      const collection = await colRes.json();

      // 2) Stats (floor, volume, holders)
      const statsRes = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}/stats`, {
        headers: {
          'Accept': 'application/json',
          'X-API-KEY': config.opensea.apiKey
        }
      });

      if (!statsRes.ok) {
        throw new Error(`Get Collection Stats failed: ${statsRes.status} ${statsRes.statusText}`);
      }
      const stats = await statsRes.json();

      // --- Parsing podle uživatelských požadavků ---
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
        
        // Try to get creator fees from NFTTracker
        try {
          const NFTTracker = require('./nftTracker');
          const nftTracker = new NFTTracker();
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
          
          await nftTracker.disconnect();
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

      const fmtEth = (n) => {
        if (n === null || n === undefined) return '—';
        if (typeof n === 'number') {
          // Pro ceny nižší než 0.01 ETH zobrazuj 4 desetinná místa
          if (n < 0.01) {
            return `${n.toFixed(4)} ETH`;
          }
          // Pro vyšší ceny zobrazuj 2 desetinná místa
          return `${n.toFixed(2)} ETH`;
        }
        return '—';
      };

      const feeList = (arr) => {
        if (!arr.length) return '—';
        return arr
          .map(f => `${typeof f.fee === 'number' ? f.fee : '—'}% (${f.required ? 'enforced' : 'optional'})`)
          .join('\n');
      };

      // Create embed podle uživatelských požadavků
      const embed = new EmbedBuilder()
        .setTitle(`📊 Collection ${name}`)
        .setURL(`https://opensea.io/collection/${slug}`)
        .setColor(0x00bfff);

      // Description pod titulek (přímo text, bez názvu field)
      if (description) {
        const shortDesc = description.length > 1024
          ? description.substring(0, 1021) + '...'
          : description;
        embed.setDescription(shortDesc);
      }

      // 1. řádek
      embed.addFields(
        { name: '🎯 Floor Price', value: fmtEth(floor), inline: true },
        { name: '🪙 Creators Fee', value: feeList(creatorFees), inline: true },
        { name: '🔢 Total Supply', value: fmt(totalSupply), inline: true }
      );

      // 2. řádek
      embed.addFields(
        { name: '📊 Average Price', value: fmtEth(averagePrice), inline: true },
        { name: '👥 Unique Holders', value: fmt(holders), inline: true },
        { name: '🔷 Chain', value: chain.toUpperCase(), inline: true }
      );

      // 3. řádek
      embed.addFields(
        { name: '📈 Total Volume', value: `${fmtEth(totalVolume)} (${fmt(totalSales)} sales)`, inline: true },
        { name: '💎 Market Cap', value: fmtEth(marketCap), inline: true },
        { name: '📅 Created', value: createdDate || '—', inline: true }
      );

      // Volume Intervals (zkráceno na Volume)
      embed.addFields(
        { name: '⏰ Volume', value: 
          `1d: ${fmtEth(oneDay?.volume)} (${fmt(oneDay?.sales)} sales)\n` +
          `7d: ${fmtEth(sevenDay?.volume)} (${fmt(sevenDay?.sales)} sales)\n` +
          `30d: ${fmtEth(thirtyDay?.volume)} (${fmt(thirtyDay?.sales)} sales)`, 
          inline: false 
        }
      );



      embed.setFooter({ text: `⚡ Powered by STPNGPT • /collection ${slug}` })
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
        await interaction.reply({ embeds: [embed] });
        console.log(`✅ Collection command completed successfully for ${slug}`);
      } catch (replyError) {
        console.error('❌ Could not send response:', replyError.message);
        // Try to send a simple reply as fallback
        try {
          await interaction.reply({ 
            content: `📊 **Collection ${name}**\n🎯 Floor: ${fmtEth(floor)}\n🪙 Creator Fee: ${feeList(creatorFees)}\n🔢 Supply: ${fmt(totalSupply)}`, 
            ephemeral: true 
          });
        } catch (fallbackError) {
          console.error('❌ Could not send fallback response:', fallbackError.message);
        }
      }

    } catch (error) {
      console.error('❌ Error in collection command:', error);
      let errorMessage = '❌ An error occurred while loading collection information.';
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        errorMessage = '⚠️ OpenSea API rate limit reached. Please try again later.';
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        errorMessage = '❌ Collection not found. Please check the collection name.';
      } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
        errorMessage = '❌ OpenSea API authentication error. Please check your API key.';
      }
      
      // Try to send error message
      try {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } catch (replyError) {
        console.error('❌ Could not send error message:', replyError.message);
      }
    }
  }

  async disconnect() {
    // No cleanup needed for this command
  }
}

module.exports = CollectionCommand;
