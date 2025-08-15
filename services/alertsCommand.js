const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const config = require('../config');
const AlertsDatabase = require('./alertsDatabase');

class AlertsCommand {
  constructor() {
    this.alertsDb = new AlertsDatabase();
  }

  async initialize() {
    const success = await this.alertsDb.initialize();
    if (success) {
      console.log('✅ Alerts database initialized');
    } else {
      console.error('❌ Failed to initialize alerts database');
    }
    return success;
  }

  getCommandData() {
    return new SlashCommandBuilder()
      .setName('alerts')
      .setDescription('Set price alerts for NFT collections or specific tokens')
      .addSubcommand(subcommand =>
        subcommand
          .setName('collection')
          .setDescription('Set floor price alert for a collection')
          .addStringOption(option =>
            option.setName('slug')
              .setDescription('Collection slug (e.g. bored-ape-yacht-club)')
              .setRequired(true)
          )
          .addStringOption(option =>
            option.setName('condition')
              .setDescription('Alert condition')
              .setRequired(true)
              .addChoices(
                { name: 'Floor drops below', value: 'below' },
                { name: 'Floor rises above', value: 'above' }
              )
          )
          .addNumberOption(option =>
            option.setName('price')
              .setDescription('Target price threshold')
              .setRequired(true)
              .setMinValue(0.0001)
          )
          .addStringOption(option =>
            option.setName('chain')
              .setDescription('Blockchain network')
              .setRequired(false)
              .addChoices(
                { name: 'Ethereum', value: 'ethereum' },
                { name: 'ApeChain', value: 'ape_chain' },
                { name: 'Berachain', value: 'berachain' },
                { name: 'Base', value: 'base' },
                { name: 'Polygon', value: 'polygon' },
                { name: 'Arbitrum', value: 'arbitrum' },
                { name: 'Optimism', value: 'optimism' }
              )
          )
          .addStringOption(option =>
            option.setName('mode')
              .setDescription('Trigger mode')
              .setRequired(false)
              .addChoices(
                { name: 'One-time (deactivates after trigger)', value: 'single' },
                { name: 'Repeat (stays active until you remove it)', value: 'repeat' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('token')
          .setDescription('Set listing alert for specific NFT token')
          .addStringOption(option =>
            option.setName('slug')
              .setDescription('Collection slug (e.g. pudgypenguins)')
              .setRequired(true)
          )
          .addStringOption(option =>
            option.setName('token_id')
              .setDescription('Token ID (supportes multiple: 123,456,789)')
              .setRequired(true)
          )
          .addStringOption(option =>
            option.setName('condition')
              .setDescription('Alert condition')
              .setRequired(true)
              .addChoices(
                { name: 'Listed below price', value: 'listed_below' },
                { name: 'Listed above price', value: 'listed_above' },
                { name: 'Any new listing', value: 'any_listing' },
                { name: 'Sold', value: 'sold' }
              )
          )
          .addNumberOption(option =>
            option.setName('price')
              .setDescription('Target price threshold (optional for any_listing/sold)')
              .setRequired(false)
              .setMinValue(0.0001)
          )
          .addStringOption(option =>
            option.setName('chain')
              .setDescription('Blockchain network')
              .setRequired(false)
              .addChoices(
                { name: 'Ethereum', value: 'ethereum' },
                { name: 'ApeChain', value: 'ape_chain' },
                { name: 'Berachain', value: 'berachain' },
                { name: 'Base', value: 'base' },
                { name: 'Polygon', value: 'polygon' },
                { name: 'Arbitrum', value: 'arbitrum' },
                { name: 'Optimism', value: 'optimism' }
              )
          )
          .addStringOption(option =>
            option.setName('mode')
              .setDescription('Trigger mode')
              .setRequired(false)
              .addChoices(
                { name: 'One-time (deactivates after trigger)', value: 'single' },
                { name: 'Repeat (stays active until you remove it)', value: 'repeat' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('traits')
          .setDescription('Set alert for NFTs with specific traits')
          .addStringOption(option =>
            option.setName('slug')
              .setDescription('Collection slug')
              .setRequired(true)
          )
          .addStringOption(option =>
            option.setName('traits')
              .setDescription('Traits (format: trait_type:value,trait_type:value)')
              .setRequired(true)
          )
          .addStringOption(option =>
            option.setName('logic')
              .setDescription('Trait matching logic')
              .setRequired(true)
              .addChoices(
                { name: 'AND (must have ALL traits)', value: 'and' },
                { name: 'OR (must have ANY trait)', value: 'or' }
              )
          )
          .addStringOption(option =>
            option.setName('condition')
              .setDescription('Alert condition')
              .setRequired(true)
              .addChoices(
                { name: 'Listed below price', value: 'listed_below' },
                { name: 'Listed above price', value: 'listed_above' },
                { name: 'Any new listing', value: 'any_listing' },
                { name: 'Sold', value: 'sold' }
              )
          )
          .addNumberOption(option =>
            option.setName('price')
              .setDescription('Target price threshold (optional for any_listing/sold)')
              .setRequired(false)
              .setMinValue(0.0001)
          )
          .addStringOption(option =>
            option.setName('chain')
              .setDescription('Blockchain network')
              .setRequired(false)
              .addChoices(
                { name: 'Ethereum', value: 'ethereum' },
                { name: 'ApeChain', value: 'ape_chain' },
                { name: 'Berachain', value: 'berachain' },
                { name: 'Base', value: 'base' },
                { name: 'Polygon', value: 'polygon' },
                { name: 'Arbitrum', value: 'arbitrum' },
                { name: 'Optimism', value: 'optimism' }
              )
          )
          .addStringOption(option =>
            option.setName('mode')
              .setDescription('Trigger mode')
              .setRequired(false)
              .addChoices(
                { name: 'One-time (deactivates after trigger)', value: 'single' },
                { name: 'Repeat (stays active until you remove it)', value: 'repeat' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('Show your active alerts')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove one or more alerts by ID')
          .addStringOption(option =>
            option.setName('alert_id')
              .setDescription('Alert ID, multiple IDs comma-separated, or -1 to remove all active')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('channel')
          .setDescription('Manage your alerts channel')
          .addStringOption(option =>
            option
              .setName('action')
              .setDescription('Action to perform')
              .addChoices(
                { name: 'Remove channel', value: 'remove' }
              )
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('stats')
          .setDescription('Show alerts system statistics')
      );
  }

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    console.log(`🔔 Alerts command executed - subcommand: ${subcommand}, user: ${userId}`);

    // Immediate reply to prevent timeout
    await interaction.reply({ content: '⏳ Processing your alert request...', ephemeral: false });

    try {
      switch (subcommand) {
        case 'collection':
          await this.handleCollectionAlert(interaction);
          break;
        case 'token':
          await this.handleTokenAlert(interaction);
          break;
        case 'traits':
          await this.handleTraitsAlert(interaction);
          break;
        case 'list':
          await this.handleListAlerts(interaction);
          break;
        case 'remove':
          await this.handleRemoveAlert(interaction);
          break;
        case 'channel':
          await this.handleChannelManagement(interaction);
          break;
        case 'stats':
          await this.handleStatsCommand(interaction);
          break;
        default:
          await interaction.reply({ 
            content: '❌ Unknown alert subcommand.', 
            ephemeral: true 
          });
      }
    } catch (error) {
      console.error('❌ Error in alerts command:', error);
      
      try {
        const errorMessage = `❌ Alert command failed: ${error.message}`;
        if (interaction.replied) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ Could not send error response:', replyError.message);
      }
    }
  }

  async handleCollectionAlert(interaction) {
    const slug = interaction.options.getString('slug');
    const condition = interaction.options.getString('condition');
    const price = interaction.options.getNumber('price');
    const chain = interaction.options.getString('chain') || 'ethereum';
    const mode = interaction.options.getString('mode') || 'single';

    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(`🔍 Fetching collection data: ${slug} on ${chain}`);

    // Získej channel manager z discord notifier
    const discordNotifier = require('../index').getDiscordNotifier();
    const channelManager = discordNotifier?.getChannelManager();
    
    if (!channelManager) {
      await interaction.editReply({ content: '❌ Channel manager not available. Please try again later.', embeds: [] });
      return;
    }

    // Vytvoř nebo získej uživatelský kanál
    const userChannel = await channelManager.getUserChannel(userId, username);
    if (!userChannel) {
      await interaction.editReply({ content: '❌ Failed to create your alerts channel. Please try again later.', embeds: [] });
      return;
    }

    // Fetch real collection data from OpenSea
    let collectionData = {
      name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
      image_url: 'https://via.placeholder.com/400x400?text=Collection+Image'
    };

    try {
      const collectionUrl = `https://api.opensea.io/api/v2/collections/${slug}`;
      console.log(`🔍 Fetching collection from: ${collectionUrl}`);

      const collectionRes = await fetch(collectionUrl, {
        headers: { 
          'X-API-KEY': config.opensea.apiKey, 
          'Accept': 'application/json'
        }
      });

      if (collectionRes.ok) {
        const collectionResponse = await collectionRes.json();
        
        collectionData = {
          name: collectionResponse.name || collectionData.name,
          image_url: collectionResponse.image_url || collectionData.image_url
        };
        
        console.log(`✅ Fetched collection data:`, { name: collectionData.name, has_image: !!collectionData.image_url });
      } else {
        console.log(`⚠️ Collection fetch failed: ${collectionRes.status}, using fallback data`);
      }
    } catch (error) {
      console.log(`⚠️ Collection fetch error: ${error.message}, using fallback data`);
    }

    const nativeSymbol = this.getNativeSymbol(chain);

    // Create alert and save to database
    const alertId = this.generateAlertId();
    const alert = {
      id: alertId,
      userId: interaction.user.id,
      username: username,
      channelId: userChannel.id,
      type: 'collection',
      slug: slug,
      chain: chain,
      condition: condition,
      price: price,
      collectionName: collectionData.name,
      createdAt: new Date().toISOString(),
      active: true,
      mode: mode
    };

    // Save to database
    await this.alertsDb.addAlert(alert);
    console.log('📝 Alert created and saved:', alert);

    const embed = new EmbedBuilder()
      .setTitle('🔔 Collection Alert Created')
      .setDescription(`Alert set for **${collectionData.name}**`)
      .setColor(0x00ff88)
      .addFields(
        { name: '📊 Collection', value: collectionData.name, inline: true },
        { name: '⛓️ Chain', value: chain.charAt(0).toUpperCase() + chain.slice(1), inline: true },
        { name: '📈 Condition', value: condition === 'below' ? 'Floor drops below' : 'Floor rises above', inline: true },
        { name: '💰 Target Price', value: `${price} ${nativeSymbol}`, inline: true },
        { name: '🆔 Alert ID', value: alertId, inline: true },
        { name: '✅ Status', value: 'Active', inline: true },
        { name: '📱 Notifications', value: `You will receive alerts in ${userChannel}`, inline: false },
        { name: '🔗 Collection', value: `[View on OpenSea](https://opensea.io/collection/${slug})`, inline: false },
        { name: '⚙️ Manage', value: `Use /alerts remove alert_id:${alertId} to delete this alert`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '⚡ Powered by STPNGPT' });

    // Always show image at the bottom
    embed.setImage(collectionData.image_url || 'https://via.placeholder.com/800x600?text=Collection+Image');

    await interaction.editReply({ content: '', embeds: [embed] });
  }

  async handleTokenAlert(interaction) {
    const slug = interaction.options.getString('slug');
    const tokenIdInput = interaction.options.getString('token_id');
    const condition = interaction.options.getString('condition');
    const price = interaction.options.getNumber('price');
    const chain = interaction.options.getString('chain') || 'ethereum';
    const mode = interaction.options.getString('mode') || 'single';

    const userId = interaction.user.id;
    const username = interaction.user.username;

    const tokenIds = tokenIdInput.split(',').map(s => s.trim()).filter(Boolean);
    console.log(`🔍 Fetching NFT data by slug: ${slug}/${tokenIds.join(',')} on ${chain}`);

    // Získej channel manager z discord notifier
    const discordNotifier = require('../index').getDiscordNotifier();
    const channelManager = discordNotifier?.getChannelManager();
    
    if (!channelManager) {
      await interaction.editReply({ content: '❌ Channel manager not available. Please try again later.', embeds: [] });
      return;
    }

    // Vytvoř nebo získej uživatelský kanál
    const userChannel = await channelManager.getUserChannel(userId, username);
    if (!userChannel) {
      await interaction.editReply({ content: '❌ Failed to create your alerts channel. Please try again later.', embeds: [] });
      return;
    }

    // Resolve slug -> contract and fetch NFT data from OpenSea
    const fallbackImage = 'https://via.placeholder.com/800x600?text=NFT+Image';
    let nft = {
      name: `Token #${tokenIds[0]}`,
      collection: 'Unknown Collection',
      image_url: fallbackImage
    };
    let contract = null;

    try {
      // First get collection info by slug to determine contract
      const collectionUrl = `https://api.opensea.io/api/v2/collections/${slug}`;
      const collectionRes = await fetch(collectionUrl, { headers: { 'X-API-KEY': config.opensea.apiKey, 'Accept': 'application/json' } });
      if (collectionRes.ok) {
        const collectionData = await collectionRes.json();
        if (Array.isArray(collectionData.contracts) && collectionData.contracts.length > 0) {
          contract = collectionData.contracts[0].address || collectionData.contracts[0];
        }
      }
      if (!contract) {
        throw new Error('Could not resolve contract from slug');
      }

      const firstId = tokenIds[0];
      const nftUrl = `https://api.opensea.io/api/v2/chain/${chain}/contract/${contract}/nfts/${firstId}`;
      console.log(`🔍 Fetching NFT from: ${nftUrl}`);

      const nftRes = await fetch(nftUrl, {
        headers: { 
          'X-API-KEY': config.opensea.apiKey, 
          'Accept': 'application/json'
        }
      });

      if (nftRes.ok) {
        const nftData = await nftRes.json();
        const nftInfo = nftData.nft || {};
        
        nft = {
          name: nftInfo.name || `${nftInfo.collection || 'Unknown'} #${firstId}`,
          collection: nftInfo.collection || 'Unknown Collection',
          image_url: nftInfo.image_url || nftInfo.display_image_url || fallbackImage
        };
        
        console.log(`✅ Fetched NFT data:`, { name: nft.name, collection: nft.collection, has_image: !!nft.image_url });
      } else {
        console.log(`⚠️ NFT fetch failed: ${nftRes.status}, using fallback data`);
      }
    } catch (error) {
      console.log(`⚠️ NFT fetch error: ${error.message}, using fallback data`);
    }

    const nativeSymbol = this.getNativeSymbol(chain);

    const createdAlertIds = [];
    for (const id of tokenIds) {
      const alertId = this.generateAlertId();
      const alert = {
        id: alertId,
        userId: interaction.user.id,
        username: username,
        channelId: userChannel.id,
        type: 'token',
        contract: contract || '',
        slug: slug,
        tokenId: id,
        chain: chain,
        condition: condition,
        price: price,
        nftName: nft.name || `#${id}`,
        collection: nft.collection,
        createdAt: new Date().toISOString(),
        active: true,
        mode: mode
      };
      await this.alertsDb.addAlert(alert);
      createdAlertIds.push(alertId);
    }
    console.log('📝 Token alerts created and saved:', createdAlertIds);

    const conditionText = {
      'listed_below': 'Listed below price',
      'listed_above': 'Listed above price', 
      'any_listing': 'Any new listing',
      'sold': 'Sold'
    };

    const embed = new EmbedBuilder()
      .setTitle('🔔 Token Alert Created')
      .setDescription(`Alert set for **${tokenIds.length}** token${tokenIds.length>1?'s':''} from **${nft.collection || 'Unknown Collection'}**`)
      .setColor(0x00ff88)
      .addFields(
        { name: '📦 Collection', value: `[${nft.collection || 'Unknown'}](https://opensea.io/collection/${nft.collection})`, inline: true },
        { name: '🆔 Token ID', value: tokenIds.map(id=>`[#${id}](https://opensea.io/assets/${chain}/${contract || 'contract'}/${id})`).join(', '), inline: true },
        { name: '⛓️ Chain', value: chain.charAt(0).toUpperCase() + chain.slice(1), inline: true },
        { name: '📈 Condition', value: conditionText[condition], inline: true },
        { name: '💰 Target Price', value: price ? `${price} ${nativeSymbol}` : 'Any price', inline: true },
        { name: '🆔 Alert ID', value: createdAlertIds.join(', '), inline: false },
        { name: '✅ Status', value: 'Active', inline: true },
        { name: '📱 Notifications', value: `You will receive alerts in ${userChannel}`, inline: false },
        { name: '⚙️ Manage', value: `Use /alerts remove alert_id:${createdAlertIds[0]} to delete this alert`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '⚡ Powered by STPNGPT' });
    if (nft.image_url) {
      embed.setImage(nft.image_url);
    }
    await interaction.editReply({ content: '', embeds: [embed] });
  }

  async handleTraitsAlert(interaction) {
    const slug = interaction.options.getString('slug');
    const traitsInput = interaction.options.getString('traits');
    const logic = interaction.options.getString('logic');
    const condition = interaction.options.getString('condition');
    const price = interaction.options.getNumber('price');
    const chain = interaction.options.getString('chain') || 'ethereum';
    const mode = interaction.options.getString('mode') || 'single';

    await interaction.editReply({ 
      content: `🔔 **Setting up traits alert...**\n⏳ Parsing traits: ${traitsInput}`,
      embeds: []
    });

    // Parse traits
    let traits;
    try {
      traits = this.parseTraits(traitsInput);
    } catch (error) {
      await interaction.editReply({ 
        content: `❌ **Invalid traits format**\nUse format: \`trait_type:value,trait_type:value\`\nExample: \`Background:Blue,Eyes:Laser\``
      });
      return;
    }

    // Validate collection
    const collectionUrl = `https://api.opensea.io/api/v2/collections/${slug}`;
    const collectionRes = await fetch(collectionUrl, {
      headers: { 'X-API-KEY': config.opensea.apiKey, 'Accept': 'application/json' }
    });

    if (!collectionRes.ok) {
      await interaction.editReply({ 
        content: `❌ **Collection not found**: \`${slug}\`\nPlease check the collection slug.`
      });
      return;
    }

    const collectionData = await collectionRes.json();
    const nativeSymbol = this.getNativeSymbol(chain);

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Get channel manager and create user channel
    const discordNotifier = require('../index').getDiscordNotifier();
    const channelManager = discordNotifier?.getChannelManager();
    
    if (!channelManager) {
      await interaction.editReply({ content: '❌ Channel manager not available. Please try again later.', embeds: [] });
      return;
    }

    const userChannel = await channelManager.getUserChannel(userId, username);
    if (!userChannel) {
      await interaction.editReply({ content: '❌ Failed to create your alerts channel. Please try again later.', embeds: [] });
      return;
    }

    const alertId = this.generateAlertId();
    const alert = {
      id: alertId,
      userId: userId,
      username: username,
      channelId: userChannel.id,
      type: 'traits',
      slug: slug,
      chain: chain,
      traits: traits,
      logic: logic,
      condition: condition,
      price: price,
      collectionName: collectionData.name,
      createdAt: new Date().toISOString(),
      active: true,
      mode: mode
    };

    // Save to database
    await this.alertsDb.addAlert(alert);
    console.log('📝 Traits alert created and saved:', alert);

    const conditionText = {
      'listed_below': 'Listed below price',
      'listed_above': 'Listed above price',
      'any_listing': 'Any new listing', 
      'sold': 'Sold'
    };

    const traitsText = traits.map(t => `**${t.trait_type}:** ${t.value}`).join('\n');
    const logicText = logic === 'and' ? 'Must have ALL traits' : 'Must have ANY trait';

    const embed = new EmbedBuilder()
      .setTitle('🔔 Traits Alert Created')
      .setDescription(`Alert set for **${collectionData.name}** with specific traits`)
      .setColor(0x00ff88)
      .addFields(
        { name: '📦 Collection', value: collectionData.name, inline: true },
        { name: '⛓️ Chain', value: chain.charAt(0).toUpperCase() + chain.slice(1), inline: true },
        { name: '🎯 Logic', value: logicText, inline: true },
        { name: '🎨 Traits', value: traitsText, inline: false },
        { name: '📈 Condition', value: conditionText[condition], inline: true },
        { name: '💰 Target Price', value: price ? `${price} ${nativeSymbol}` : 'Any price', inline: true },
        { name: '🆔 Alert ID', value: alertId, inline: true },
        { name: '📱 Notifications', value: 'You will receive DM alerts when matching NFTs meet your conditions', inline: false },
        { name: '🔗 Collection', value: `[View on OpenSea](https://opensea.io/collection/${slug})`, inline: false },
        { name: '⚙️ Manage', value: `Use /alerts remove alert_id:${alertId} to delete this alert`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: '⚡ Powered by STPNGPT' });

    // Always show image at the bottom
    embed.setImage(collectionData.image_url || 'https://via.placeholder.com/800x600?text=Collection+Image');

    await interaction.editReply({ content: '', embeds: [embed] });
  }

  async handleListAlerts(interaction) {
    const userId = interaction.user.id;
    const userAlerts = this.alertsDb.getUserAlerts(userId);
    
    if (userAlerts.length === 0) {
      await interaction.editReply({ 
        content: `📋 **Your Active Alerts**\n\n❌ You don't have any active alerts.\n\n💡 **Create your first alert:**\n• \`/alerts collection\` - Set floor price alerts\n• \`/alerts token\` - Set specific NFT alerts\n• \`/alerts traits\` - Set trait-based alerts`,
        embeds: []
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Your Active Alerts')
      .setDescription(`You have **${userAlerts.length}** active alert${userAlerts.length !== 1 ? 's' : ''}`)
      .setColor(0x00bfff)
      .setTimestamp()
      .setFooter({ text: 'Skadi NFT Tracker' });

    // Group alerts by type
    const collectionAlerts = userAlerts.filter(a => a.type === 'collection');
    const tokenAlerts = userAlerts.filter(a => a.type === 'token');
    const traitsAlerts = userAlerts.filter(a => a.type === 'traits');

    if (collectionAlerts.length > 0) {
      const alertsList = collectionAlerts.map(alert => {
        const condition = alert.condition === 'above' ? '📈 Above' : '📉 Below';
        const chain = alert.chain.charAt(0).toUpperCase() + alert.chain.slice(1);
        const symbol = this.getNativeSymbol(alert.chain);
        return `• **${alert.collectionName}** (${chain})\n  ${condition} ${alert.price} ${symbol} • ID: \`${alert.id}\``;
      }).join('\n\n');
      
      embed.addFields({ 
        name: `🏛️ Collection Alerts (${collectionAlerts.length})`, 
        value: alertsList.length > 1024 ? alertsList.substring(0, 1020) + '...' : alertsList, 
        inline: false 
      });
    }

    if (tokenAlerts.length > 0) {
      const alertsList = tokenAlerts.map(alert => {
        const conditionMap = {
          'listed_below': '📉 Listed below',
          'listed_above': '📈 Listed above',
          'any_listing': '📋 Any listing',
          'sold': '💰 Sold'
        };
        const condition = conditionMap[alert.condition] || alert.condition;
        const chain = alert.chain.charAt(0).toUpperCase() + alert.chain.slice(1);
        const symbol = this.getNativeSymbol(alert.chain);
        const priceText = alert.price ? ` ${alert.price} ${symbol}` : '';
        return `• **${alert.nftName}** (${chain})\n  ${condition}${priceText} • ID: \`${alert.id}\``;
      }).join('\n\n');
      
      embed.addFields({ 
        name: `🎨 Token Alerts (${tokenAlerts.length})`, 
        value: alertsList.length > 1024 ? alertsList.substring(0, 1020) + '...' : alertsList, 
        inline: false 
      });
    }

    if (traitsAlerts.length > 0) {
      const alertsList = traitsAlerts.map(alert => {
        const conditionMap = {
          'listed_below': '📉 Listed below',
          'listed_above': '📈 Listed above',
          'any_listing': '📋 Any listing',
          'sold': '💰 Sold'
        };
        const condition = conditionMap[alert.condition] || alert.condition;
        const chain = alert.chain.charAt(0).toUpperCase() + alert.chain.slice(1);
        const symbol = this.getNativeSymbol(alert.chain);
        const priceText = alert.price ? ` ${alert.price} ${symbol}` : '';
        const logic = alert.logic === 'and' ? 'ALL' : 'ANY';
        const traitsText = alert.traits.map(t => `${t.trait_type}:${t.value}`).join(', ');
        return `• **${alert.collectionName}** (${chain})\n  ${condition}${priceText} • ${logic} traits: ${traitsText}\n  ID: \`${alert.id}\``;
      }).join('\n\n');
      
      embed.addFields({ 
        name: `🎯 Traits Alerts (${traitsAlerts.length})`, 
        value: alertsList.length > 1024 ? alertsList.substring(0, 1020) + '...' : alertsList, 
        inline: false 
      });
    }

    embed.addFields({
      name: '⚙️ Management',
      value: '• Use `/alerts remove alert_id:ID` to remove an alert\n• Use `/alerts channel action:remove` to delete your alerts channel',
      inline: false
    });

    await interaction.editReply({ content: '', embeds: [embed] });
  }

  async handleRemoveAlert(interaction) {
    const input = interaction.options.getString('alert_id');
    const userId = interaction.user.id;

    // Special case: -1 removes all active alerts
    if (input.trim() === '-1') {
      const removedCount = await this.alertsDb.removeAllActiveUserAlerts(userId);
      if (removedCount === 0) {
        await interaction.editReply({ content: '📋 You have no active alerts to remove.', embeds: [] });
        return;
      }
      const embedAll = new EmbedBuilder()
        .setTitle('🗑️ Alerts Removed')
        .setDescription(`Removed ${removedCount} active alert${removedCount !== 1 ? 's' : ''}.`)
        .setColor(0xff6b6b)
        .setTimestamp()
        .setFooter({ text: 'Skadi NFT Tracker' });
      await interaction.editReply({ content: '', embeds: [embedAll] });
      return;
    }

    // Multiple IDs comma-separated support
    const ids = input.split(',').map(s => s.trim()).filter(Boolean);
    const results = { removed: [], notFound: [] };

    for (const id of ids) {
      // Quick sanity check: IDs are alphanumeric (legacy IDs are uppercase base36)
      const ok = await this.alertsDb.removeAlert(userId, id);
      if (ok) results.removed.push(id);
      else results.notFound.push(id);
    }

    if (results.removed.length === 0) {
      await interaction.editReply({ 
        content: `❌ **No matching alerts found**\nIDs: \`${ids.join(', ')}\`\n\nUse \`/alerts list\` to view your active alerts.`,
        embeds: []
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Alerts Removed')
      .setDescription(`Removed: \`${results.removed.join(', ')}\``)
      .setColor(0xff6b6b)
      .setTimestamp()
      .setFooter({ text: 'Skadi NFT Tracker' });

    if (results.notFound.length > 0) {
      embed.addFields({ name: 'Not found', value: results.notFound.map(id => `\`${id}\``).join(', ').slice(0, 1000), inline: false });
    }

    await interaction.editReply({ content: '', embeds: [embed] });
  }

  parseTraits(traitsInput) {
    const traits = [];
    const pairs = traitsInput.split(',');
    
    for (const pair of pairs) {
      const [trait_type, value] = pair.split(':').map(s => s.trim());
      if (!trait_type || !value) {
        throw new Error('Invalid trait format');
      }
      traits.push({ trait_type, value });
    }
    
    return traits;
  }

  async handleChannelManagement(interaction) {
    const action = interaction.options.getString('action');
    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(`🔧 Channel management: ${action} for user ${username}`);

    // Získej channel manager z discord notifier
    const discordNotifier = require('../index').getDiscordNotifier();
    const channelManager = discordNotifier?.getChannelManager();
    
    if (!channelManager) {
      await interaction.editReply({ content: '❌ Channel manager not available. Please try again later.', embeds: [] });
      return;
    }

    if (action === 'remove') {
      try {
        const result = await channelManager.deleteUserChannel(userId);
        if (!result.ok) {
          await interaction.editReply({ 
            content: '❌ You don\'t have an alerts channel to remove.', 
            embeds: [] 
          });
          return;
        }

        // Remove all user alerts from database
        const removedCount = await this.alertsDb.removeAllUserAlerts(userId);

        const embed = new EmbedBuilder()
          .setTitle('🗑️ Alerts Channel Removed')
          .setDescription('Your alerts channel and all associated alerts have been successfully removed.')
          .setColor(0xff6b6b)
          .addFields(
            { name: '✅ Status', value: 'Channel deleted', inline: true },
            { name: '🔔 Alerts Removed', value: `${removedCount} alert${removedCount !== 1 ? 's' : ''} deleted`, inline: true },
            { name: '📝 Note', value: 'A new channel will be created when you set your next alert', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Skadi NFT Tracker' });

        await interaction.editReply({ content: '', embeds: [embed] });
      } catch (error) {
        console.error(`❌ Error removing channel: ${error.message}`);
        await interaction.editReply({ 
          content: '❌ Failed to remove your alerts channel. Please try again later.', 
          embeds: [] 
        });
      }
    }
  }

  getNativeSymbol(chainName) {
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
  }

  async handleStatsCommand(interaction) {
    try {
      // Get alerts monitor from discord notifier
      const discordNotifier = require('../index').getDiscordNotifier();
      const alertsMonitor = discordNotifier?.getAlertsMonitor();
      
      if (!alertsMonitor) {
        await interaction.editReply({ 
          content: '❌ Alerts monitoring system not available.', 
          embeds: [] 
        });
        return;
      }

      const stats = alertsMonitor.getStats();
      const userStats = this.alertsDb.getStats();

      const embed = new EmbedBuilder()
        .setTitle('📊 Alerts System Statistics')
        .setDescription('Current status of the alerts monitoring system')
        .setColor(0x00bfff)
        .addFields(
          {
            name: '📈 Global Statistics',
            value: `**Total Users:** ${userStats.totalUsers}\n**Total Alerts:** ${userStats.totalAlerts}\n**Active Alerts:** ${userStats.activeAlerts}`,
            inline: true
          },
          {
            name: '🎯 Alerts by Type',
            value: `**Collection:** ${stats?.byType?.collection || 0}\n**Token:** ${stats?.byType?.token || 0}\n**Traits:** ${stats?.byType?.traits || 0}`,
            inline: true
          },
          {
            name: '⚡ System Status',
            value: '🟢 **Active**\n✅ Floor price monitoring\n✅ Transaction monitoring\n🔄 Checking every 3 minutes',
            inline: false
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Skadi NFT Tracker • Alerts System' });

      await interaction.editReply({ content: '', embeds: [embed] });
    } catch (error) {
      console.error('❌ Error showing alerts stats:', error.message);
      await interaction.editReply({ 
        content: '❌ Failed to retrieve alerts statistics.', 
        embeds: [] 
      });
    }
  }

  generateAlertId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }
}

module.exports = AlertsCommand;
