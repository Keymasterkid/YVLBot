const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'play',
  description: 'Play a song from YouTube/SoundCloud/Spotify',
  usage: '!play <query>',
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(message, args, client, prefix, db) {
    const { channel } = message.member.voice;

    if (!channel) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ You need to be in a voice channel!')
        ]
      });
    }

    if (!args.length) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Please provide a song name or URL!')
        ]
      });
    }

    const query = args.join(' ');

    try {
      const loadingMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Blue')
            .setDescription('🔍 Searching...')
        ]
      });

      console.log(`[Play Command] Searching for: ${query}`);
      const res = await client.moonlink.search({
        query,
        source: 'youtube', // Default source
        requester: message.author.id
      });

      console.log(`[Play Command] Search res: loadType=${res.loadType}, tracks=${res.tracks?.length}`);

      if (res.loadType === 'error') {
        console.error('[Play Command] Search error:', res.exception);
        return loadingMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription(`❌ An error occurred while searching: ${res.exception?.message || 'Unknown error'}`)
          ]
        });
      }

      if (res.loadType === 'empty') {
        // Try a generic search if youtube specifically failed
        console.log('[Play Command] No results with youtube source, trying generic search...');
        const genericRes = await client.moonlink.search({
          query: `ytsearch:${query}`,
          requester: message.author.id
        });

        console.log(`[Play Command] Generic search res: loadType=${genericRes.loadType}, tracks=${genericRes.tracks?.length}`);

        if (genericRes.loadType === 'empty' || genericRes.loadType === 'error') {
          return loadingMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No results found. Try a more specific name or a direct link.')
            ]
          });
        }

        // Use generic results if they exist
        Object.assign(res, genericRes);
      }

      let player = client.moonlink.players.get(message.guild.id);

      if (!player) {
        player = client.moonlink.createPlayer({
          guildId: message.guild.id,
          voiceChannelId: channel.id,
          textChannelId: message.channel.id,
          autoLeave: true
        });
      }

      if (!player.connected) player.connect({ setDeaf: true });

      if (res.loadType === 'playlist') {
        for (const track of res.tracks) {
          track.setRequester(message.author.id); // Ensure requester is set via Moonlink method
          player.queue.add(track);
        }
        loadingMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('Green')
              .setDescription(`✅ Added playlist **${res.playlistInfo.name}** (${res.tracks.length} tracks) to the queue.`)
          ]
        });
      } else {
        const track = res.tracks[0];
        track.setRequester(message.author.id); // Ensure requester is set via Moonlink method
        player.queue.add(track);
        loadingMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('Green')
              .setDescription(`✅ Added **${track.title}** to the queue.`)
          ]
        });
      }

      if (!player.playing && !player.paused) player.play();

    } catch (error) {
      console.error('Play error:', error);
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(`❌ Error: ${error.message}`)
        ]
      });
    }
  },
  initMusicEvents(client) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, Events } = require('discord.js');

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

    client.moonlink.on('playerDeafChange', (player, selfDeaf, serverDeaf) => {
      if (selfDeaf === false) {
        player.connect({ setDeaf: true });
      }
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
      const channelId = player.textChannelId || player.get('lastTextChannelId');
      const channel = client.channels.cache.get(channelId);
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

    // Handle music button interactions
    client.on(Events.InteractionCreate, async interaction => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith('music_')) return; // IMPORTANT: Only handle music buttons

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
        console.error('Music button interaction error:', error);
      }
    });
  }
};
