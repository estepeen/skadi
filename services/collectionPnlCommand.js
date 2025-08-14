const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const config = require('../config');

class CollectionPnlCommand {
  constructor() {}

  getCommandData() {
    return new SlashCommandBuilder()
      .setName('collectionpnl')
      .setDescription('Compute realized PnL for a wallet in a specific collection')
      .addStringOption(option =>
        option.setName('wallet')
          .setDescription('Wallet address (0x...)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('slug')
          .setDescription('Collection slug (e.g. nightglyders)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('chain')
          .setDescription('Blockchain network')
          .setRequired(false)
          .addChoices(
            { name: 'Ethereum', value: 'ethereum' },
            { name: 'ApeChain', value: 'ape_chain' },
            { name: 'Base', value: 'base' },
            { name: 'Polygon', value: 'polygon' },
            { name: 'Arbitrum', value: 'arbitrum' },
            { name: 'Optimism', value: 'optimism' }
          )
      );
  }

  // Helper functions for robust event parsing
  lower(x) { return (x || '').toLowerCase(); }

  getContractFromEvent(evt) {
    return this.lower(
      evt?.nft?.contract ||
      evt?.contract ||
      evt?.asset?.asset_contract?.address ||
      evt?.asset?.contract_address || // některé v2 tvary
      ''
    );
  }

  getTokenIdFromEvent(evt) {
    // token id může být číslo nebo string – vždy string
    const id =
      evt?.nft?.identifier ??
      evt?.asset?.token_id ??
      evt?.token_id ??
      evt?.item?.nft_id?.split('/')?.pop(); // občas přijde composite
    return id != null ? String(id) : '';
  }

  getSellerFromEvent(evt) {
    return this.lower(
      evt?.seller?.address ||
      evt?.from_account?.address ||
      evt?.sender?.address ||
      ''
    );
  }

  getBuyerFromEvent(evt) {
    return this.lower(
      evt?.buyer?.address ||
      evt?.to_account?.address ||
      evt?.recipient?.address ||
      ''
    );
  }

  parsePayment(evt) {
    // Nejčastější tvary ve v2
    // 1) evt.payment.{quantity,decimals,usd_amount}
    // 2) evt.payment_token.{decimals}, evt.sale_price
    // 3) evt.price.value (většinou v wei-like jednotkách) + evt.price.currency?.decimals
    let native = 0;
    let usd = 0;

    if (evt?.payment?.quantity) {
      const dec = Number(evt?.payment?.decimals ?? 18);
      native = Number(evt.payment.quantity) / (10 ** dec);
      usd = Number(evt?.payment?.usd_amount ?? 0);
      return { native, usd };
    }

    if (evt?.sale_price != null) {
      const dec = Number(evt?.payment_token?.decimals ?? 18);
      native = Number(evt.sale_price) / (10 ** dec);
      // USD někdy není – nevadí
      usd = Number(evt?.payment?.usd_amount ?? 0);
      return { native, usd };
    }

    if (evt?.price?.value != null) {
      const dec = Number(evt?.price?.currency?.decimals ?? 18);
      native = Number(evt.price.value) / (10 ** dec);
      usd = Number(evt?.price?.currency?.usd_price ?? 0) * native || 0;
      return { native, usd };
    }

    return { native: 0, usd: 0 };
  }

  async fetchAllAccountEvents({ wallet, chain, after, apiKey }) {
    let cursor = null;
    const out = [];

    // Pozn.: řetězíme event_type param několikrát
    while (true) {
      const params = new URLSearchParams({
        limit: '100',
        occurred_after: String(after),
        chain
      });
      // add multi event_type
      ['sale','mint','bid_accepted'].forEach(t => params.append('event_type', t));
      if (cursor) params.set('cursor', cursor);

      const url = `https://api.opensea.io/api/v2/events/accounts/${wallet}?${params.toString()}`;
      console.log(`🔗 Fetching events: ${url}`);
      
      const res = await fetch(url, { headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`Events fetch failed: ${res.status} ${await res.text()}`);

      const json = await res.json();
      const arr = Array.isArray(json.asset_events) ? json.asset_events
                : Array.isArray(json.events) ? json.events
                : [];

      console.log(`📊 Fetched ${arr.length} events, cursor: ${cursor}`);
      out.push(...arr);

      cursor = json.next || json.next_cursor || null;
      if (!cursor) break; // konec stránkování
    }
    return out;
  }

  async execute(interaction) {
    try {
      // Defer reply to avoid interaction timeout
      await interaction.deferReply();
      
      const wallet = interaction.options.getString('wallet', true).toLowerCase();
      const slug = interaction.options.getString('slug', true);
      const chain = interaction.options.getString('chain') || 'ethereum';

      // Map chain names to OpenSea chain IDs
      const chainMap = {
        'ethereum': 'ethereum',
        'ape_chain': 'ape_chain',
        'base': 'base',
        'polygon': 'polygon',
        'arbitrum': 'arbitrum',
        'optimism': 'optimism'
      };
      const openSeaChain = chainMap[chain] || chain;

      console.log(`🔍 /collectionpnl for wallet ${wallet}, slug ${slug} on ${chain} (OpenSea: ${openSeaChain})`);

      // Resolve collection contracts for given slug + chain
      const NFTTracker = require('./nftTracker');
      const nftTracker = new NFTTracker();
      const collectionInfo = await nftTracker.getCollectionInfoBySlug(slug, chain);

      // 1) robustně sežeň eventy (včetně paginace)
      const apiKey = config.opensea.apiKey;
      const occurredAfter = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      
      let events;
      try {
        events = await this.fetchAllAccountEvents({
          wallet,
          chain: openSeaChain,
          after: occurredAfter,
          apiKey
        });
      } catch (e) {
        await interaction.editReply({ content: `❌ Failed to fetch account events: ${e.message}` });
        return;
      }

      console.log(`📊 Total events fetched: ${events.length}`);

      // 2) kontrakty kolekce – buď filtruj chain, nebo když není k dispozici, nech vše
      const contracts = Array.isArray(collectionInfo?.contracts)
        ? collectionInfo.contracts
            .filter(c => {
              const ch = this.lower(c?.chain);
              return !ch || ch === this.lower(openSeaChain); // když není chain, nezahazuj
            })
            .map(c => this.lower(c?.address))
            .filter(Boolean)
        : [];

      console.log(`🔗 Collection contracts: ${contracts.join(', ')}`);

      if (contracts.length === 0) {
        await interaction.editReply({ content: '❌ No contracts found for this collection on selected chain.' });
        return;
      }

      // 3) vyber jen prodeje dané kolekce, kde jsi prodávající
      const saleEvents = events.filter(evt => {
        const contractAddr = this.getContractFromEvent(evt);
        const seller = this.getSellerFromEvent(evt);
        return contractAddr && contracts.includes(contractAddr) && seller === wallet;
      });

      console.log(`💰 Sale events found: ${saleEvents.length}`);

      // 4) výpočet
      let totalPnL = 0;
      let totalPnLUSD = 0;
      let realizedSales = 0;
      let totalBuy = 0;
      let totalSell = 0;
      const rows = [];

      for (const evt of saleEvents) {
        try {
          const { native: salePrice, usd: salePriceUSD } = this.parsePayment(evt);
          if (!Number.isFinite(salePrice) || salePrice <= 0) {
            console.log(`⚠️ Skipping event with invalid price: ${JSON.stringify(evt, null, 2)}`);
            continue;
          }

          const contractAddress = this.getContractFromEvent(evt);
          const tokenId = this.getTokenIdFromEvent(evt);

          console.log(`🔍 Recovering purchase data for ${contractAddress} #${tokenId}`);

          const purchase = await nftTracker.recoverPurchaseData(contractAddress, tokenId, wallet, openSeaChain);
          if (!purchase || !Number.isFinite(purchase.price)) {
            console.log(`⚠️ No purchase data found for ${contractAddress} #${tokenId}`);
            continue;
          }

          const pnl = salePrice - purchase.price;
          const pnlUSD = (salePriceUSD || 0) - (purchase.priceUSD || 0);

          totalPnL += pnl;
          totalPnLUSD += pnlUSD;
          realizedSales += 1;
          totalBuy += purchase.price;
          totalSell += salePrice;

          rows.push({ tokenId, buy: purchase.price, sell: salePrice, pnl });
          
          console.log(`✅ PnL calculated: ${pnl} (buy: ${purchase.price}, sell: ${salePrice})`);
        } catch (e) {
          console.error(`❌ Error processing event:`, e);
          continue;
        }
      }

      const nativeSymbol = nftTracker.getNativeTokenSymbol(openSeaChain);

      const embed = new EmbedBuilder()
        .setTitle(`📈 PnL for ${slug}`)
        .setColor(0x00bfff)
        .addFields(
          { name: '👛 Wallet', value: wallet, inline: false },
          { name: '🔷 Chain', value: chain.toUpperCase(), inline: true },
          { name: '🧾 Sales Count', value: String(realizedSales), inline: true },
          { name: '💰 Total Buy', value: `${totalBuy.toFixed(4)} ${nativeSymbol}`, inline: true },
          { name: '💵 Total Sell', value: `${totalSell.toFixed(4)} ${nativeSymbol}`, inline: true },
          { name: '📊 Realized PnL', value: `${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(4)} ${nativeSymbol}`, inline: true },
          { name: '⚠️ Note', value: 'PnL calculation does not include gas fees, platform fees, or other transaction costs.', inline: false }
        )
        .setFooter({ text: '⚡ Powered by STPNGPT • /collectionpnl' })
        .setTimestamp();

      // Add collection stats info
      if (collectionInfo?.stats) {
        const stats = collectionInfo.stats;
        const floorPrice = stats.floor_price ? `${stats.floor_price} ${nativeSymbol}` : '—';
        const totalVolume = stats.total_volume ? `${stats.total_volume} ${nativeSymbol}` : '—';
        
        embed.addFields(
          { name: '🏠 Floor Price', value: floorPrice, inline: true },
          { name: '📈 Total Volume', value: totalVolume, inline: true }
        );
      }

      // Add top 5 results (wins/losses)
      if (rows.length > 0) {
        rows.sort((a, b) => b.pnl - a.pnl);
        const top = rows.slice(0, 5).map(r => `#${r.tokenId}: ${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(4)} ${nativeSymbol}`).join('\n');
        const bottom = rows.slice(-5).reverse().map(r => `#${r.tokenId}: ${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(4)} ${nativeSymbol}`).join('\n');
        embed.addFields(
          { name: '🏆 Top PnL', value: top || '—', inline: false },
          { name: '⚠️ Worst PnL', value: bottom || '—', inline: false }
        );
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Error in collectionpnl command:', error);
      const errorMessage = '❌ An error occurred while calculating PnL.';
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (_) {}
    }
  }
}

module.exports = CollectionPnlCommand;


