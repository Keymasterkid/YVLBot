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

      if (!player.connected) player.connect();

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
  }
};
