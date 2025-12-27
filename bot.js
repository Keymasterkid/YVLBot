const { Client, Events, GatewayIntentBits, Partials, Collection, EmbedBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Manager } = require('moonlink.js');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const db = require('./utils/database');
const commandHandler = require('./utils/commandHandler');
const VCTracking = require('./VC_tracking');
const logStuff = require('./log_stuff');
const nukeProtection = require('./utils/nukeProtection');

// Create a client instance with the correct intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // If you need to access message content
    GatewayIntentBits.GuildPresences, // If you need presence updates
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});

// Bot prefix
const prefix = config.prefix || '!';

// Create collections for commands and cooldowns
client.commands = new Collection();
client.slashCommands = new Collection();
client.cooldowns = new Collection();

// Initialize Moonlink Manager
client.moonlink = new Manager({
  nodes: config.nodes,
  options: {
    clientName: 'YVLBot',
    spotify: config.spotify,
  },
  sendPayload: (guildId, sdata) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(JSON.parse(sdata));
  }
});

// Error handling function
function handleError(error, context) {
  console.error(`Error in ${context}:`, error);
  // You can add additional error handling here, like sending to a logging channel
}

// Function to start the bot
async function startBot() {
  try {
    // Initialize database
    await db.initializeTables();
    console.log('Database initialized successfully');

    // Load commands
    commandHandler.loadCommands();
    console.log('Commands loaded successfully');

    // Register slash commands
    await registerSlashCommands();
    console.log('Slash commands registered successfully');

    // Set up event listeners
    setupEventListeners();

    // Log in to Discord
    await client.login(config.token);
  } catch (error) {
    handleError(error, 'startBot');
    process.exit(1);
  }
}



// Register slash commands with Discord
async function registerSlashCommands() {
  try {
    if (!config.token) {
      throw new Error('Bot token is not configured');
    }

    const rest = new REST({ version: '10' }).setToken(config.token);

    // Get all slash commands
    const slashCommands = commandHandler.getSlashCommands();

    // Register commands globally
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: slashCommands }
    );

    console.log('Successfully registered slash commands globally');
  } catch (error) {
    console.error('Error registering slash commands:', error);
    throw error;
  }
}

// Set up event listeners
function setupEventListeners() {
  // Ready event
  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Initialize Moonlink
    await client.moonlink.init(client.user.id);
    console.log('✅ Moonlink initialized');

    // Health check and status logging
    console.log('=== Bot Health Check ===');
    console.log(`Guilds: ${client.guilds.cache.size}`);
    console.log(`Commands loaded: ${commandHandler.commands.size}`);
    console.log(`Slash commands loaded: ${commandHandler.slashCommands.size}`);
    console.log(`Prefix: ${prefix}`);
    console.log(`Database: ${db ? 'Connected' : 'Not connected'}`);
    console.log(`Token: ${config.token ? 'Set' : 'Missing'}`);
    console.log(`Client ID: ${config.clientId ? 'Set' : 'Missing'}`);
    console.log('========================');

    // Warn about missing critical config
    if (!config.token) {
      console.warn('⚠️  WARNING: Bot token is missing from config!');
    }
    if (!config.clientId) {
      console.warn('⚠️  WARNING: Client ID is missing from config!');
    }
    if (!db) {
      console.warn('⚠️  WARNING: Database connection failed!');
    }

    // Initialize server data
    for (const guild of client.guilds.cache.values()) {
      try {
        await db.addServerIfNotExists(guild.id, guild.ownerId, guild.name);
        // Initialize default commands for each server
        await db.insertDefaultCommands(guild.id);
        // Initialize nuke protection settings
        await db.initializeNukeProtectionSettings(guild.id);
      } catch (error) {
        console.error(`Error initializing server ${guild.name}:`, error);
      }
    }

    // Initialize modules
    try {
      console.log('Starting module initialization...');

      // Start auto status updater
      const changeStatusModule = require('./commands/BAdmin/change_status');
      changeStatusModule.startAutoStatus(client);
      console.log('✅ Auto status updater started');

      // Start VC tracking
      VCTracking(client, db);
      console.log('✅ VC tracking initialized');

      // Initialize nuke protection BEFORE registering log/event listeners
      console.log('Initializing nuke protection...');
      const success = await nukeProtection.initialize();
      console.log(`✅ Nuke protection initialized: ${success}`);

      // Initialize logging and events
      await logStuff(client, db);
      console.log('✅ Logging system initialized');

      // Load all events from the events directory
      require('./events/events')(client, db);
      console.log('✅ Events loaded');

      console.log('✅ All modules initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing modules:', error);
    }
  });

  // Message event
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    try {
      // Add user to database
      await db.addUserIfNotExists(message.author.id, message.author.username);

      // Check for spam
      await nukeProtection.handleSpam(message);

      // Handle prefix commands
      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Debug logging
        console.log('Command requested:', commandName);

        try {
          const handled = await commandHandler.handlePrefixCommand(message, commandName, args);
          if (handled) {
            console.log(`Command ${commandName} handled by commandHandler`);
            return;
          } else {
            console.log('Command not found:', commandName);
          }
        } catch (handlerError) {
          console.error(`Error using commandHandler for ${commandName}:`, handlerError);
        }
      }

      // Handle XP gain
      await handleXpGain(message);
    } catch (error) {
      console.error('Error in message event:', error.stack || error);
    }
  });

  // Interaction event
  client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isCommand()) {
      try {
        const handled = await commandHandler.handleSlashCommand(interaction);
        if (handled) return;
      } catch (error) {
        console.error('Error handling slash command:', error.stack || error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'There was an error executing this command!',
            flags: [MessageFlags.Ephemeral]
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            content: 'There was an error executing this command!'
          });
        }
      }
    } else if (interaction.isButton()) {
      const player = client.moonlink.players.get(interaction.guild.id);
      if (!player) return interaction.reply({ content: 'No music is playing.', flags: [MessageFlags.Ephemeral] });

      const { channel } = interaction.member.voice;
      if (!channel || channel.id !== player.voiceChannelId) {
        return interaction.reply({ content: 'You must be in the same voice channel as the bot to use these buttons.', flags: [MessageFlags.Ephemeral] });
      }

      try {
        switch (interaction.customId) {
          case 'music_pause_resume':
            const isPaused = player.paused;
            if (isPaused) {
              player.resume();
            } else {
              player.pause();
            }

            // Toggle the label and update the message
            const newLabel = isPaused ? '⏸️' : '▶️';
            const updatedRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('music_pause_resume').setLabel(newLabel).setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('music_vol_down').setLabel('🔉').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_vol_up').setLabel('🔊').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({ components: [updatedRow] });
            break;
          case 'music_skip':
            player.skip();
            await interaction.reply({ content: '⏭️ Skipped track', flags: [MessageFlags.Ephemeral] });
            break;
          case 'music_stop':
            player.destroy();
            await interaction.reply({ content: '⏹️ Stopped playback', flags: [MessageFlags.Ephemeral] });
            break;
          case 'music_vol_down':
            let volDown = Math.max(0, (player.volume || 100) - 10);
            player.setVolume(volDown);
            await interaction.reply({ content: `🔉 Volume decreased to ${volDown}%`, flags: [MessageFlags.Ephemeral] });
            break;
          case 'music_vol_up':
            let volUp = Math.min(100, (player.volume || 100) + 10);
            player.setVolume(volUp);
            await interaction.reply({ content: `🔊 Volume increased to ${volUp}%`, flags: [MessageFlags.Ephemeral] });
            break;
        }
      } catch (error) {
        console.error('Button interaction error:', error);
      }
    }
  });

  // Error event
  client.on(Events.Error, error => {
    console.error('Discord client error:', error);
  });

  // Warn event
  client.on(Events.Warn, info => {
    console.warn('Discord client warning:', info);
  });

  // Moonlink raw packet update
  client.on(Events.Raw, (packet) => {
    client.moonlink.packetUpdate(packet);
  });

  // Moonlink event listeners
  client.moonlink.on('nodeConnected', (node) => {
    console.log(`[Moonlink] Node "${node.identifier}" connected.`);
  });

  client.moonlink.on('nodeError', (node, error) => {
    console.error(`[Moonlink] Node "${node.identifier}" encountered an error:`, error);
  });

  client.moonlink.on('debug', (message) => {
    console.log(`[Moonlink Debug] ${message}`);
  });

  client.moonlink.on('trackStart', async (player, track) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel) {
      // Delete old message if it exists
      const oldMessageId = player.get('nowPlayingMessageId');
      if (oldMessageId) {
        channel.messages.fetch(oldMessageId).then(m => m.delete().catch(() => { })).catch(() => { });
        player.set('nowPlayingMessageId', null);
      }

      const requesterId = (track.requestedBy && typeof track.requestedBy === 'object' ? track.requestedBy.id || track.requestedBy : track.requestedBy) || 'Unknown';
      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`[${track.title}](${track.url})`)
        .addFields(
          { name: 'Duration', value: track.isStream ? '🔴 Live Stream' : new Date(track.duration).toISOString().substr(11, 8), inline: true },
          { name: 'Requested By', value: `<@${requesterId}>`, inline: true }
        )
        .setColor(0x3498DB)
        .setThumbnail(track.thumbnail || null)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_pause_resume').setLabel('⏯️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('music_vol_down').setLabel('🔉').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_vol_up').setLabel('🔊').setStyle(ButtonStyle.Secondary)
      );

      const msg = await channel.send({ embeds: [embed], components: [row] });
      player.set('nowPlayingMessageId', msg.id);
      player.set('lastTextChannelId', player.textChannelId); // Backup channel ID
    }
  });

  client.moonlink.on('queueEnd', async (player) => {
    const channel = client.channels.cache.get(player.textChannelId || player.get('lastTextChannelId'));
    if (channel) {
      // Cleanup buttons before destroying
      const oldMessageId = player.get('nowPlayingMessageId');
      if (oldMessageId) {
        channel.messages.fetch(oldMessageId).then(m => m.delete().catch(() => { })).catch(() => { });
        player.set('nowPlayingMessageId', null);
      }
      channel.send('🎵 Queue is empty. Leaving voice channel.').then(m => setTimeout(() => m.delete().catch(() => { }), 5000));
    }
    player.destroy();
  });

  client.moonlink.on('autoLeaved', async (player) => {
    console.log(`[Moonlink] Auto-leaved guild ${player.guildId}`);
    const channelId = player.textChannelId || player.get('lastTextChannelId');
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      const oldMessageId = player.get('nowPlayingMessageId');
      if (oldMessageId) {
        channel.messages.fetch(oldMessageId).then(m => m.delete().catch(() => { })).catch(() => { });
        player.set('nowPlayingMessageId', null);
      }
    }
  });

  client.moonlink.on('playerDestroy', async (player) => {
    console.log(`[Moonlink] Player destroyed for guild ${player.guildId}`);
    const channelId = player.textChannelId || player.get('lastTextChannelId');
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      const oldMessageId = player.get('nowPlayingMessageId');
      if (oldMessageId) {
        channel.messages.fetch(oldMessageId).then(m => m.delete().catch(() => { })).catch(() => { });
        player.set('nowPlayingMessageId', null);
      }
    }
  });
}

// Handle XP gain and leveling system
async function handleXpGain(message) {
  try {
    const userId = message.author.id;
    const serverId = message.guild.id;

    // Check cooldown
    if (client.cooldowns.has('xp')) {
      const timestamps = client.cooldowns.get('xp');
      if (timestamps.has(userId)) {
        const lastMessageTime = timestamps.get(userId);
        const cooldown = config.cooldowns.xp;

        if (Date.now() - lastMessageTime < cooldown) {
          return;
        }
      }
    }

    // Update cooldown
    if (!client.cooldowns.has('xp')) {
      client.cooldowns.set('xp', new Collection());
    }
    client.cooldowns.get('xp').set(userId, Date.now());

    // Calculate XP gain
    const xpGain = Math.floor(Math.random() * (config.xp.max - config.xp.min + 1)) + config.xp.min;
    await db.updateUserXP(userId, serverId, xpGain);

    // Check for level up
    const userLevel = await db.getUserLevel(userId, serverId);
    const xpToNextLevel = userLevel.level * config.xp.levelMultiplier;

    if (userLevel.xp >= xpToNextLevel) {
      const newLevel = userLevel.level + 1;
      await db.updateUserLevel(userId, serverId, newLevel);

      const levelUpEmbed = new EmbedBuilder()
        .setColor('#4CAF50')
        .setTitle('🎉 Level Up! 🎉')
        .setDescription(`${message.author}, you've reached level **${newLevel}**!`)
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
          { name: 'Next Level', value: `${newLevel + 1}`, inline: true },
          { name: 'XP to Next', value: `${xpToNextLevel - userLevel.xp}`, inline: true }
        )
        .setFooter({ text: 'Leveling system' })
        .setTimestamp();

      await message.channel.send({ embeds: [levelUpEmbed] });
    }
  } catch (error) {
    handleError(error, 'handleXpGain');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Bot is shutting down...');
  try {
    await db.close();
    console.log('Database connection closed');
    client.destroy();
    process.exit(0);
  } catch (error) {
    handleError(error, 'Shutdown process');
    process.exit(1);
  }
});

// Start the bot
// Handle global errors to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception] thrown:', err);
  // Optional: process.exit(1);
});

startBot();
