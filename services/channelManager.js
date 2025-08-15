const { ChannelType, PermissionFlagsBits } = require('discord.js');

class ChannelManager {
  constructor(client) {
    this.client = client;
    this.categoryName = 'NFT Alerts';
    this.categoryIdByGuild = new Map();
    this.userChannelsByGuild = new Map();
  }

  async initialize(guildId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        console.log('❌ Guild not found for channel manager');
        return false;
      }

      let category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && c.name === this.categoryName
      );

      if (!category) {
        console.log(`📁 Creating category: ${this.categoryName}`);
        category = await guild.channels.create({
          name: this.categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
      }

      this.categoryIdByGuild.set(guild.id, category.id);
      await this.loadExistingChannels(guild);
      
      console.log(`✅ Channel Manager initialized with category: ${this.categoryName}`);
      return true;
    } catch (error) {
      console.log(`❌ Failed to initialize channel manager: ${error.message}`);
      return false;
    }
  }

  async loadExistingChannels(guild) {
    try {
      const categoryId = this.categoryIdByGuild.get(guild.id);
      const alertsChannels = guild.channels.cache.filter(channel => 
        channel.parentId === categoryId && 
        channel.name.startsWith('alerts-')
      );

      console.log(`🔍 Found ${alertsChannels.size} existing alerts channels`);

      let map = this.userChannelsByGuild.get(guild.id);
      if (!map) {
        map = new Map();
        this.userChannelsByGuild.set(guild.id, map);
      }

      for (const [channelId, channel] of alertsChannels) {
        try {
          const userOverwrite = channel.permissionOverwrites.cache.find(overwrite => 
            overwrite.type === 1 && // PermissionOverwriteType.Member
            overwrite.id !== guild.roles.everyone.id &&
            overwrite.id !== this.client.user.id
          );

          if (userOverwrite) {
            map.set(userOverwrite.id, channelId);
            console.log(`📝 Loaded channel mapping: ${userOverwrite.id} -> ${channel.name}`);
          }
        } catch (error) {
          console.log(`⚠️ Could not process channel ${channel.name}: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`❌ Failed to load existing channels: ${error.message}`);
    }
  }

  async getUserChannel(userId, username, guildId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error('Guild not available');
      }

      let map = this.userChannelsByGuild.get(guild.id);
      if (!map) {
        map = new Map();
        this.userChannelsByGuild.set(guild.id, map);
      }

      if (map.has(userId)) {
        const channelId = map.get(userId);
        const channel = this.client.channels.cache.get(channelId);
        if (channel) {
          console.log(`✅ Found existing alerts channel: ${channel.name} for user ${username}`);
          return channel;
        } else {
          map.delete(userId);
        }
      }

      console.log(`🔍 Scanning for existing alerts channel for user ${username}...`);
      let categoryId = this.categoryIdByGuild.get(guild.id);
      if (!categoryId) {
        const category = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildCategory && c.name === this.categoryName
        );
        if (category) {
          categoryId = category.id;
          this.categoryIdByGuild.set(guild.id, categoryId);
        }
      }

      const alertsChannels = guild.channels.cache.filter(channel => 
        channel.type === ChannelType.GuildText &&
        channel.name.startsWith('alerts-')
      );

      for (const [channelId, channel] of alertsChannels) {
        try {
          const userOverwrite = channel.permissionOverwrites.cache.find(overwrite => 
            overwrite.type === 1 && // PermissionOverwriteType.Member
            overwrite.id === userId &&
            overwrite.id !== guild.roles.everyone.id &&
            overwrite.id !== this.client.user.id
          );

          if (userOverwrite) {
            console.log(`✅ Found existing alerts channel: ${channel.name} for user ${username}`);
            map.set(userId, channelId);
            return channel;
          }
        } catch (error) {
          console.log(`⚠️ Could not check permissions for channel ${channel.name}: ${error.message}`);
        }
      }

      const channelName = `alerts-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      console.log(`📝 Creating new private alerts channel: ${channelName} for user ${username}`);
      if (!categoryId) {
        const category = await guild.channels.create({
          name: this.categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
          ]
        });
        categoryId = category.id;
        this.categoryIdByGuild.set(guild.id, categoryId);
      }

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        position: 0, // Place at the top of the category
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages
            ]
          },
          // Bot permissions
          {
            id: this.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      map.set(userId, channel.id);

      // Send welcome message
      await this.sendWelcomeMessage(channel, userId);

      console.log(`✅ Created new alerts channel: ${channel.name} (${channel.id}) for ${username}`);
      return channel;
    } catch (error) {
      console.log(`❌ Failed to get/create user channel: ${error.message}`);
      return null;
    }
  }

  async sendWelcomeMessage(channel, userId) {
    try {
      const welcomeEmbed = {
        title: '🔔 Welcome to Your NFT Alerts Channel!',
        description: `<@${userId}> This is your **exclusive** alerts channel. All your alerts from anywhere on the server will be delivered here.`,
        color: 0x00bfff,
        fields: [
          {
            name: '📋 How it works',
            value: '• Set alerts using `/alerts` commands anywhere on the server\n• All notifications will be delivered to this channel\n• Only you can see messages in this channel\n• You have only **one** alerts channel per server',
            inline: false
          },
          {
            name: '🎯 Alert Types Available',
            value: '• Collection floor price alerts\n• Specific NFT token alerts\n• Trait-based alerts',
            inline: false
          },
          {
            name: '⚙️ Channel Management',
            value: '• Use `/alerts channel action:remove` to delete this channel\n• Deleting this channel will remove all your active alerts',
            inline: false
          }
        ],
        footer: {
          text: 'Skadi NFT Tracker • Your personal alerts channel',
          icon_url: 'https://via.placeholder.com/32x32?text=🤖'
        },
        timestamp: new Date().toISOString()
      };

      await channel.send({ 
        content: `<@${userId}> 🔔 **Welcome to your alerts channel!**`,
        embeds: [welcomeEmbed] 
      });
    } catch (error) {
      console.log(`❌ Failed to send welcome message: ${error.message}`);
    }
  }

  async sendAlert(userId, alertEmbed) {
    try {
      const channelId = this.userChannels.get(userId);
      if (!channelId) {
        console.log(`⚠️ No channel found for user ${userId}`);
        return false;
      }

      const channel = this.client.channels.cache.get(channelId);
      if (!channel) {
        console.log(`⚠️ Channel ${channelId} not found in cache`);
        this.userChannels.delete(userId);
        return false;
      }

      // Přidej mention do embedu
      const alertMessage = `<@${userId}> 🚨 **Alert Triggered!**`;
      
      await channel.send({ 
        content: alertMessage,
        embeds: [alertEmbed] 
      });

      console.log(`✅ Alert sent to ${channel.name} for user ${userId}`);
      return true;
    } catch (error) {
      console.log(`❌ Failed to send alert: ${error.message}`);
      return false;
    }
  }

  getUserChannelId(userId) {
    return this.userChannels.get(userId);
  }

  getAllUserChannels() {
    return new Map(this.userChannels);
  }

  removeUserChannel(userId) {
    this.userChannels.delete(userId);
  }

  async deleteUserChannel(userId, guildId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error('Guild not available');
      }

      let map = this.userChannelsByGuild.get(guild.id);
      if (!map) {
        map = new Map();
        this.userChannelsByGuild.set(guild.id, map);
      }

      let channelId = map.get(userId);

      if (!channelId) {
        let categoryId = this.categoryIdByGuild.get(guild.id);
        if (!categoryId) {
          const category = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && c.name === this.categoryName
          );
          if (category) {
            categoryId = category.id;
            this.categoryIdByGuild.set(guild.id, categoryId);
          }
        }

        const candidates = guild.channels.cache.filter(ch => 
          ch.type === ChannelType.GuildText &&
          (!categoryId || ch.parentId === categoryId) &&
          ch.name.startsWith('alerts-')
        );

        for (const [cid, ch] of candidates) {
          const overwrite = ch.permissionOverwrites?.cache?.get(userId) || ch.permissionOverwrites?.cache?.find(ow => ow.id === userId);
          if (overwrite) {
            channelId = cid;
            break;
          }
        }
      }

      if (!channelId) {
        return { ok: false, reason: 'not_found' };
      }

      let channel = this.client.channels.cache.get(channelId);
      if (!channel) {
        try { channel = await this.client.channels.fetch(channelId); } catch {}
      }

      if (channel) {
        await channel.delete('User requested channel removal');
      }

      map.delete(userId);
      
      // TODO: Remove all alerts for this user from database
      // This would be implemented when we have persistent alert storage
      console.log(`🗑️ Channel deleted for user ${userId} - alerts would be removed from database`);
      
      return { ok: true };
    } catch (error) {
      console.log(`❌ Error deleting user channel: ${error.message}`);
      return { ok: false, error: error.message };
    }
  }
}

module.exports = ChannelManager;
