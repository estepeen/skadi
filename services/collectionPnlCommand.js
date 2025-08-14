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

  async execute(interaction) {
    try {
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

      // Contracts present in collection
      const contracts = Array.isArray(collectionInfo?.contracts)
        ? collectionInfo.contracts
            .filter(c => (c?.chain || '').toLowerCase() === (openSeaChain || 'ethereum').toLowerCase())
            .map(c => (c.address || '').toLowerCase())
            .filter(Boolean)
        : [];

      if (contracts.length === 0) {
        await interaction.reply({ content: '❌ No contracts found for this collection on selected chain.', ephemeral: true });
        return;
      }

      // Fetch account events and filter to collection contracts
      const apiKey = config.opensea.apiKey;
      const occurredAfter = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
      const eventsUrl = `https://api.opensea.io/api/v2/events/accounts/${wallet}?event_type=sale&event_type=mint&event_type=bid_accepted&occurred_after=${occurredAfter}&limit=100&chain=${openSeaChain}`;
      const res = await fetch(eventsUrl, { headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' } });
      if (!res.ok) {
        await interaction.reply({ content: `❌ Failed to fetch account events: ${res.status} ${res.statusText}`, ephemeral: true });
        return;
      }
      const data = await res.json();
      const events = Array.isArray(data.asset_events) ? data.asset_events : [];

      // Helper to safely extract fields from different v2 shapes
      const getContract = (evt) => (evt.contract || evt.asset?.asset_contract?.address || evt.nft?.contract || '').toLowerCase();
      const getTokenId = (evt) => (evt.nft?.identifier || evt.asset?.token_id || evt.token_id || '').toString();
      const getSeller = (evt) => (evt.seller?.address || evt.from_account?.address || '').toLowerCase();
      const getBuyer = (evt) => (evt.buyer?.address || evt.to_account?.address || '').toLowerCase();

      // Filter only sales where wallet is the seller and contract in collection
      const saleEvents = events.filter(evt => {
        const contractAddr = getContract(evt);
        const seller = getSeller(evt);
        return contractAddr && contracts.includes(contractAddr) && seller === wallet;
      });

      let totalPnL = 0;
      let totalPnLUSD = 0;
      let realizedSales = 0;
      let totalBuy = 0;
      let totalSell = 0;
      const rows = [];

      for (const evt of saleEvents) {
        try {
          // Parse sale price
          let salePrice = 0;
          let salePriceUSD = 0;
          let decimals = 18;
          if (evt.payment_token) {
            decimals = Number(evt.payment_token.decimals ?? 18);
          }
          if (evt.sale_price != null) {
            salePrice = Number(evt.sale_price) / Math.pow(10, decimals);
          } else if (evt.payment && evt.payment.quantity) {
            salePrice = Number(evt.payment.quantity) / Math.pow(10, Number(evt.payment.decimals ?? 18));
          }
          if (evt.payment?.usd_amount) {
            salePriceUSD = Number(evt.payment.usd_amount);
          }

          const contractAddress = getContract(evt);
          const tokenId = getTokenId(evt);

          // Recover previous buy for PnL
          const purchase = await nftTracker.recoverPurchaseData(contractAddress, tokenId, wallet, openSeaChain);
          if (!purchase || !Number.isFinite(purchase.price)) {
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
        } catch (e) {
          // Skip problematic event
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

      // Add top 5 results (wins/losses)
      if (rows.length > 0) {
        rows.sort((a, b) => b.pnl - a.pnl);
        const top = rows.slice(0, 5).map(r => `#${r.tokenId}: ${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(4)} ${nativeSymbol}`).join('\n');
        const bottom = rows.slice(-5).map(r => `#${r.tokenId}: ${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(4)} ${nativeSymbol}`).join('\n');
        embed.addFields(
          { name: '🏆 Top PnL', value: top || '—', inline: false },
          { name: '⚠️ Worst PnL', value: bottom || '—', inline: false }
        );
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Error in collectionpnl command:', error);
      const errorMessage = '❌ An error occurred while calculating PnL.';
      try {
        if (!interaction.replied) {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
      } catch (_) {}
    }
  }
}

module.exports = CollectionPnlCommand;


