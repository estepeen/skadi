const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const config = require('./config');

async function testNewEmbed() {
  try {
    console.log('🧪 Testing New Collection Embed...');
    console.log('='.repeat(50));
    
    const testSlug = 'tiny-buds40x40';
    const chain = 'base';
    
    console.log(`🔍 Testing collection: ${testSlug}`);
    console.log(`📍 Chain: ${chain}`);
    console.log('');
    
    // Fetch data
    const [colRes, statsRes] = await Promise.all([
      fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(testSlug)}?chain=${chain}`, {
        headers: { 'Accept': 'application/json', 'X-API-KEY': config.opensea.apiKey }
      }),
      fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(testSlug)}/stats?chain=${chain}`, {
        headers: { 'Accept': 'application/json', 'X-API-KEY': config.opensea.apiKey }
      })
    ]);
    
    if (!colRes.ok || !statsRes.ok) {
      throw new Error('API call failed');
    }
    
    const collection = await colRes.json();
    const stats = await statsRes.json();
    
    // Parse data podle uživatelských požadavků
    const name = collection?.name ?? testSlug;
    const createdDate = collection?.created_date ?? null;
    const totalSupply = collection?.total_supply ?? null;
    const description = collection?.description ?? null;
    const fees = Array.isArray(collection?.fees) ? collection.fees : [];
    
    const creatorFees = fees.filter(f => f && f.recipient && f.required === false);
    const platformFees = fees.filter(f => f && f.required === true);
    
    const floor = stats?.total?.floor_price ?? null;
    const totalVolume = stats?.total?.volume ?? null;
    const totalSales = stats?.total?.sales ?? null;
    const holders = stats?.total?.num_owners ?? null;
    const marketCap = stats?.total?.market_cap ?? null;
    const averagePrice = stats?.total?.average_price ?? null;
    
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
        return `${n.toFixed(4)} ETH`;
      }
      return '—';
    };
    
    const feeList = (arr) => {
      if (!arr.length) return '—';
      return arr
        .map(f => `${typeof f.fee === 'number' ? f.fee : '—'}% → ${f.recipient?.slice(0,6)}…${f.recipient?.slice(-4)}${f.required ? ' (required)' : ''}`)
        .join('\n');
    };
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${name}`)
      .setURL(`https://opensea.io/collection/${testSlug}`)
      .setColor(0x00ff88)
      .addFields(
        // 1. COLLECTION DETAIL - přeuspořádáno podle požadavků
        { name: '🎯 Floor Price', value: fmtEth(floor), inline: true },
        { name: '🔢 Total Supply', value: fmt(totalSupply), inline: true },
        { name: '📅 Created', value: createdDate || '—', inline: true },
        
        // Chain info
        { name: '🔷 Chain', value: chain.toUpperCase(), inline: false },
        
        // 2. ROYALTIES
        { name: '💰 Creator Fees', value: feeList(creatorFees), inline: false },
        { name: '💸 Platform Fees', value: feeList(platformFees), inline: false },
        
        // 3. STATS
        { name: '📈 Total Volume', value: `${fmtEth(totalVolume)} (${fmt(totalSales)} sales)`, inline: false },
        { name: '👥 Unique Holders', value: fmt(holders), inline: true },
        { name: '💎 Market Cap', value: fmtEth(marketCap), inline: true },
        { name: '📊 Average Price', value: fmtEth(averagePrice), inline: true },
        
        // Time intervals
        { name: '⏰ Volume Intervals', value: 
          `1d: ${fmtEth(oneDay?.volume)} (${fmt(oneDay?.sales)} sales)\n` +
          `7d: ${fmtEth(sevenDay?.volume)} (${fmt(sevenDay?.sales)} sales)\n` +
          `30d: ${fmtEth(thirtyDay?.volume)} (${fmt(thirtyDay?.sales)} sales)`, 
          inline: false 
        }
      )
      .setFooter({ text: `Source: OpenSea API v2 • /collection ${testSlug}` })
      .setTimestamp();
    
    if (collection?.image_url) {
      embed.setThumbnail(collection.image_url);
    }
    
    if (description) {
      const shortDesc = description.length > 1024
        ? description.substring(0, 1021) + '...'
        : description;
      embed.addFields({ name: '📝 Description', value: shortDesc, inline: false });
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
    
    // Display embed structure
    console.log('🎨 NEW EMBED STRUCTURE (ENGLISH):');
    console.log('='.repeat(50));
    console.log(`Title: ${embed.data.title}`);
    console.log(`Description: ${embed.data.description}`);
    console.log(`Color: ${embed.data.color}`);
    console.log(`Thumbnail: ${embed.data.thumbnail?.url || 'None'}`);
    console.log('');
    
    console.log('📋 Fields:');
    embed.data.fields?.forEach((field, index) => {
      console.log(`${index + 1}. ${field.name}: ${field.value}`);
    });
    
    console.log('');
    console.log(`Footer: ${embed.data.footer?.text}`);
    console.log(`Timestamp: ${embed.data.timestamp}`);
    
    console.log('');
    console.log('✅ New embed test completed!');
    console.log('💡 This is exactly what will appear in Discord.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testNewEmbed();
