const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// Global queue management
const queues = new Map();

class Queue {
  constructor() {
    this.songs = [];
    this.player = createAudioPlayer();
    this.connection = null;
    this.currentSong = null;
    this.volume = 1;
    this.loop = false;
    this.playing = false;
    this.controlMessage = null;
    this.collector = null;
    this.messageChannel = null;
  }

  async playNext(message) {
    if (this.songs.length === 0) {
      if (!this.loop) {
        this.playing = false;
        if (this.connection) {
          try {
            this.connection.destroy();
          } catch (error) {
            console.error('Error destroying connection:', error);
          }
        }
        // Clear the control message
        if (this.controlMessage) {
          try {
            await this.controlMessage.edit({ components: [] });
          } catch (error) {
            console.error('Error clearing control message:', error);
          }
        }
        // Stop the collector if it exists
        if (this.collector) {
          this.collector.stop();
        }
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('Yellow')
              .setDescription('🎵 Queue is empty. Leaving voice channel.')
          ]
        });
      }
      if (this.currentSong) {
        this.songs.push(this.currentSong);
      }
    }

    const song = this.songs.shift();
    this.currentSong = song;

    try {
      console.log('Attempting to play song:', song.url);
      
      const stream = await ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }
      });

      // Check if we need to create a new connection
      let connection = getVoiceConnection(message.guild.id);
      if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        console.log('Creating new voice connection');
        connection = joinVoiceChannel({
          channelId: message.member.voice.channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false,
        });
        
        // Set up connection error handling
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch (error) {
            console.error('Connection error:', error);
            connection.destroy();
            this.playing = false;
            queues.delete(message.guild.id);
          }
        });

        connection.on('error', error => {
          console.error('Voice connection error:', error);
          connection.destroy();
          this.playing = false;
          queues.delete(message.guild.id);
        });
      }

      this.connection = connection;

      console.log('Creating audio resource');
      const resource = createAudioResource(stream, { 
        inlineVolume: true,
        inputType: 'opus'
      });
      
      resource.volume.setVolume(this.volume);

      // Set up error handling for the player
      this.player.on('error', error => {
        console.error('Player error:', error);
        this.player.stop();
        this.playNext(message);
      });

      // Set up state change handling
      this.player.on('stateChange', (oldState, newState) => {
        console.log(`Player state changed from ${oldState.status} to ${newState.status}`);
        if (newState.status === AudioPlayerStatus.Idle) {
          this.playNext(message);
        }
      });

      // Subscribe the player to the connection
      this.connection.subscribe(this.player);

      console.log('Starting playback');
      this.player.play(resource);

      try {
        await entersState(this.player, AudioPlayerStatus.Playing, 5_000);
        console.log('Successfully entered playing state');
      } catch (error) {
        console.error('Failed to enter playing state:', error);
        throw new Error('Failed to start playback');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`[${song.title}](${song.url})`)
        .addFields(
          { name: 'Duration', value: song.duration, inline: true },
          { name: 'Requested By', value: song.requestedBy.username, inline: true },
          { name: 'Queue Length', value: `${this.songs.length} songs`, inline: true }
        )
        .setColor(0x3498DB)
        .setThumbnail(song.thumbnail || null)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pause')
          .setLabel('⏸️ Pause')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('skip')
          .setLabel('⏭️ Skip')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('stop')
          .setLabel('⏹️ Stop')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('loop')
          .setLabel('🔁 Loop')
          .setStyle(ButtonStyle.Secondary)
      );

      // Clear previous control message if it exists
      if (this.controlMessage) {
        try {
          await this.controlMessage.edit({ components: [] });
        } catch (error) {
          console.error('Error clearing previous control message:', error);
        }
      }

      // Stop previous collector if it exists
      if (this.collector) {
        this.collector.stop();
      }

      this.controlMessage = await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      // Create a new collector that lasts until the song is done
      this.collector = this.controlMessage.createMessageComponentCollector({
        filter: i => i.user.id === song.requestedBy.id,
        time: 0 // No time limit
      });

      this.collector.on('collect', async interaction => {
        try {
          switch (interaction.customId) {
            case 'pause':
              if (this.player.state.status === AudioPlayerStatus.Playing) {
                this.player.pause();
                await interaction.reply({
                  content: '⏸️ Paused playback',
                  ephemeral: true
                });
              } else if (this.player.state.status === AudioPlayerStatus.Paused) {
                this.player.unpause();
                await interaction.reply({
                  content: '▶️ Resumed playback',
                  ephemeral: true
                });
              }
              break;
            case 'skip':
              this.player.stop();
              await interaction.reply({
                content: '⏭️ Skipped to next song',
                ephemeral: true
              });
              break;
            case 'stop':
              this.songs = [];
              this.player.stop();
              if (this.connection) this.connection.destroy();
              this.playing = false;
              if (this.collector) this.collector.stop();
              await interaction.reply({
                content: '⏹️ Stopped playback and cleared queue',
                ephemeral: true
              });
              break;
            case 'loop':
              this.loop = !this.loop;
              await interaction.reply({
                content: this.loop ? '🔁 Loop enabled' : '🔁 Loop disabled',
                ephemeral: true
              });
              break;
          }
        } catch (error) {
          console.error('Error handling button interaction:', error);
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          }).catch(() => {});
        }
      });

      // The collector will automatically stop when the song is done
      // because we call playNext which creates a new collector

    } catch (error) {
      console.error('Error playing song:', error);
      
      let errorMessage = '❌ Error playing song: ';
      if (error.message.includes('Video unavailable')) {
        errorMessage += 'This video is unavailable or private.';
      } else if (error.message.includes('Sign in')) {
        errorMessage += 'This video requires sign in to view.';
      } else if (error.message.includes('Age restricted')) {
        errorMessage += 'This video is age restricted.';
      } else if (error.message.includes('Copyright')) {
        errorMessage += 'This video has copyright restrictions.';
      } else {
        errorMessage += error.message;
      }
      
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(`${errorMessage} Skipping to next.`)
        ]
      });
      this.playNext(message);
    }
  }
}

module.exports = {
  name: 'play',
  description: 'Play a song from YouTube',
  usage: '!play <YouTube URL>',
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  queues, // Export the queues for other commands to use
  async execute(message, args) {
    // Check if user is in a voice channel
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ You need to be in a voice channel!')
        ]
      });
    }

    // Check if bot has permission to join and speak
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ I need permission to connect and speak in that voice channel!')
        ]
      });
    }

    if (!args.length) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Please provide a YouTube URL!')
        ]
      });
    }

    const url = args[0];

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Please provide a valid YouTube URL!\n\nSupported formats:\n• https://youtube.com/watch?v=...\n• https://youtu.be/...\n• https://www.youtube.com/watch?v=...')
        ]
      });
    }

    try {
      // Show loading message
      const loadingMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Blue')
            .setDescription('🔍 Fetching song information...')
        ]
      });

      const info = await ytdl.getInfo(url);
      const song = {
        url,
        title: info.videoDetails.title,
        duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(11, 8),
        requestedBy: message.author,
        thumbnail: info.videoDetails.thumbnails?.[0]?.url || null
      };

      // Delete loading message
      try {
        await loadingMsg.delete();
      } catch (error) {
        console.error('Error deleting loading message:', error);
      }

      let queue = queues.get(message.guild.id);
      if (!queue) {
        queue = new Queue();
        queues.set(message.guild.id, queue);
      }

      queue.songs.push(song);

      if (!queue.playing) {
        queue.playing = true;
        await queue.playNext(message);
      } else {
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Green')
              .setDescription(`✅ Added to queue: [${song.title}](${song.url})`)
          ]
        });
      }
    } catch (error) {
      console.error('Error:', error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(`❌ Error playing the song: ${error.message}`)
        ]
      });
    }
  },
};
