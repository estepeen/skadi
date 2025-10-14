const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Command to manage ignored NFT collections
 */
class IgnoreCommand {
  constructor() {
    this.ignoreFilePath = path.join(__dirname, '..', 'ignored-collections.txt');
  }

  /**
   * Get slash command data
   */
  getCommandData() {
    return new SlashCommandBuilder()
      .setName('ignore')
      .setDescription('Manage ignored NFT collections')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add collection to ignore list')
          .addStringOption(option =>
            option
              .setName('slug')
              .setDescription('Collection slug (e.g. bored-ape-yacht-club)')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove collection from ignore list')
          .addStringOption(option =>
            option
              .setName('slug')
              .setDescription('Collection slug to remove')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('Show all ignored collections')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('clear')
          .setDescription('Remove all ignored collections')
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator); // Only admins can use this
  }

  /**
   * Execute the command
   */
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    console.log(`🚫 Ignore command executed - subcommand: ${subcommand}, user: ${interaction.user.username}`);

    await interaction.deferReply({ ephemeral: true });

    try {
      switch (subcommand) {
        case 'add':
          await this.handleAdd(interaction);
          break;
        case 'remove':
          await this.handleRemove(interaction);
          break;
        case 'list':
          await this.handleList(interaction);
          break;
        case 'clear':
          await this.handleClear(interaction);
          break;
        default:
          await interaction.editReply({
            content: '❌ Unknown subcommand.',
            embeds: []
          });
      }
    } catch (error) {
      console.error('❌ Error in ignore command:', error);
      await interaction.editReply({
        content: `❌ Command failed: ${error.message}`,
        embeds: []
      });
    }
  }

  /**
   * Add collection to ignore list
   */
  async handleAdd(interaction) {
    const slug = interaction.options.getString('slug').toLowerCase().trim();

    // Validate slug format (basic validation)
    if (!slug || slug.includes(' ') || slug.includes('#')) {
      await interaction.editReply({
        content: '❌ Invalid collection slug format. Use the slug from OpenSea URL.\nExample: `bored-ape-yacht-club`',
        embeds: []
      });
      return;
    }

    // Read current ignored collections
    const ignoredCollections = this.readIgnoredCollections();

    // Check if already ignored
    if (ignoredCollections.includes(slug)) {
      await interaction.editReply({
        content: `⚠️ Collection \`${slug}\` is already in the ignore list.`,
        embeds: []
      });
      return;
    }

    // Add to list
    ignoredCollections.push(slug);
    this.writeIgnoredCollections(ignoredCollections);

    // Reload config to apply changes
    this.reloadConfig();

    const embed = new EmbedBuilder()
      .setTitle('🚫 Collection Added to Ignore List')
      .setDescription(`Successfully added **${slug}** to the ignore list.`)
      .setColor(0xFF6B6B)
      .addFields(
        { name: '📊 Collection', value: `\`${slug}\``, inline: true },
        { name: '📝 Total Ignored', value: `${ignoredCollections.length} collection${ignoredCollections.length !== 1 ? 's' : ''}`, inline: true },
        { name: '⚠️ Note', value: 'Transactions from this collection will no longer send Discord notifications.', inline: false },
        { name: '🔗 OpenSea', value: `[View Collection](https://opensea.io/collection/${slug})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Skadi NFT Tracker' });

    await interaction.editReply({
      content: '',
      embeds: [embed]
    });

    console.log(`✅ Added ${slug} to ignore list (total: ${ignoredCollections.length})`);
  }

  /**
   * Remove collection from ignore list
   */
  async handleRemove(interaction) {
    const slug = interaction.options.getString('slug').toLowerCase().trim();

    // Read current ignored collections
    const ignoredCollections = this.readIgnoredCollections();

    // Check if exists
    if (!ignoredCollections.includes(slug)) {
      await interaction.editReply({
        content: `⚠️ Collection \`${slug}\` is not in the ignore list.\nUse \`/ignore list\` to see all ignored collections.`,
        embeds: []
      });
      return;
    }

    // Remove from list
    const filteredCollections = ignoredCollections.filter(s => s !== slug);
    this.writeIgnoredCollections(filteredCollections);

    // Reload config to apply changes
    this.reloadConfig();

    const embed = new EmbedBuilder()
      .setTitle('✅ Collection Removed from Ignore List')
      .setDescription(`Successfully removed **${slug}** from the ignore list.`)
      .setColor(0x51CF66)
      .addFields(
        { name: '📊 Collection', value: `\`${slug}\``, inline: true },
        { name: '📝 Total Ignored', value: `${filteredCollections.length} collection${filteredCollections.length !== 1 ? 's' : ''}`, inline: true },
        { name: '✅ Note', value: 'Transactions from this collection will now send Discord notifications.', inline: false },
        { name: '🔗 OpenSea', value: `[View Collection](https://opensea.io/collection/${slug})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Skadi NFT Tracker' });

    await interaction.editReply({
      content: '',
      embeds: [embed]
    });

    console.log(`✅ Removed ${slug} from ignore list (total: ${filteredCollections.length})`);
  }

  /**
   * List all ignored collections
   */
  async handleList(interaction) {
    const ignoredCollections = this.readIgnoredCollections();

    if (ignoredCollections.length === 0) {
      await interaction.editReply({
        content: '📋 **Ignored Collections**\n\n✅ No collections are currently being ignored.\n\n💡 Use `/ignore add slug:collection-name` to add a collection to the ignore list.',
        embeds: []
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🚫 Ignored Collections')
      .setDescription(`Currently ignoring **${ignoredCollections.length}** collection${ignoredCollections.length !== 1 ? 's' : ''}`)
      .setColor(0xFF6B6B)
      .setTimestamp()
      .setFooter({ text: 'Skadi NFT Tracker' });

    // Group collections into chunks of 10 for better readability
    const chunkSize = 10;
    for (let i = 0; i < ignoredCollections.length; i += chunkSize) {
      const chunk = ignoredCollections.slice(i, i + chunkSize);
      const collectionsList = chunk
        .map((slug, index) => `${i + index + 1}. [\`${slug}\`](https://opensea.io/collection/${slug})`)
        .join('\n');

      const fieldName = i === 0 ? '📋 Collections' : `📋 Collections (cont.)`;
      embed.addFields({
        name: fieldName,
        value: collectionsList.length > 1024 ? collectionsList.substring(0, 1020) + '...' : collectionsList,
        inline: false
      });
    }

    embed.addFields({
      name: '⚙️ Management',
      value: '• Use `/ignore remove slug:NAME` to remove a collection\n• Use `/ignore clear` to remove all collections',
      inline: false
    });

    await interaction.editReply({
      content: '',
      embeds: [embed]
    });
  }

  /**
   * Clear all ignored collections
   */
  async handleClear(interaction) {
    const ignoredCollections = this.readIgnoredCollections();

    if (ignoredCollections.length === 0) {
      await interaction.editReply({
        content: '⚠️ The ignore list is already empty.',
        embeds: []
      });
      return;
    }

    const count = ignoredCollections.length;

    // Clear the list
    this.writeIgnoredCollections([]);

    // Reload config to apply changes
    this.reloadConfig();

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Ignore List Cleared')
      .setDescription(`Successfully removed **${count}** collection${count !== 1 ? 's' : ''} from the ignore list.`)
      .setColor(0xFFA94D)
      .addFields(
        { name: '✅ Status', value: 'All collections cleared', inline: true },
        { name: '📝 Total Ignored', value: '0 collections', inline: true },
        { name: '⚠️ Note', value: 'All collections will now send Discord notifications.', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Skadi NFT Tracker' });

    await interaction.editReply({
      content: '',
      embeds: [embed]
    });

    console.log(`✅ Cleared ignore list (removed ${count} collections)`);
  }

  /**
   * Read ignored collections from file
   */
  readIgnoredCollections() {
    try {
      if (!fs.existsSync(this.ignoreFilePath)) {
        return [];
      }

      const content = fs.readFileSync(this.ignoreFilePath, 'utf-8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(slug => slug.toLowerCase());
    } catch (error) {
      console.error('❌ Error reading ignored collections:', error.message);
      return [];
    }
  }

  /**
   * Write ignored collections to file
   */
  writeIgnoredCollections(collections) {
    try {
      const header = [
        '# 🚫 Ignored NFT Collections',
        '# Add collection slugs here (one per line)',
        '# Lines starting with # are comments and will be ignored',
        '#',
        '# How to find collection slug:',
        '# - Go to OpenSea: https://opensea.io/collection/SLUG',
        '# - The slug is the last part of the URL',
        '#',
        '# Managed via Discord /ignore command',
        ''
      ].join('\n');

      const content = header + collections.join('\n') + (collections.length > 0 ? '\n' : '');
      fs.writeFileSync(this.ignoreFilePath, content, 'utf-8');
    } catch (error) {
      console.error('❌ Error writing ignored collections:', error.message);
      throw error;
    }
  }

  /**
   * Reload config to apply changes
   */
  reloadConfig() {
    try {
      // Clear require cache for config
      const configPath = path.join(__dirname, '..', 'config.js');
      delete require.cache[require.resolve(configPath)];
      
      // Reload config
      const config = require('../config');
      
      console.log('🔄 Config reloaded with updated ignore list');
      console.log('📋 Current ignored collections:', config.ignoredCollections);
    } catch (error) {
      console.error('❌ Error reloading config:', error.message);
    }
  }
}

module.exports = IgnoreCommand;

