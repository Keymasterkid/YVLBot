const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
  name: 'volume',
  description: 'Set the playback volume (0-100)',
  usage: '!volume [0-100]',
  aliases: ['vol'],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
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

    // Check if bot is in the same voice channel
    const botVoiceChannel = message.guild.members.me.voice.channel;
    if (!botVoiceChannel || botVoiceChannel.id !== voiceChannel.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ I need to be in the same voice channel as you!')
        ]
      });
    }

    // Get the queue for this guild
    const { queues } = require('./play');
    const queue = queues.get(message.guild.id);

    if (!queue || !queue.playing) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setDescription('🎵 There is nothing playing right now!')
        ]
      });
    }

    // If no volume specified, show current volume
    if (!args.length) {
      const currentVolume = Math.round(queue.volume * 100);
      const volumeBar = '🔊 ' + '█'.repeat(Math.floor(currentVolume / 10)) + '░'.repeat(10 - Math.floor(currentVolume / 10)) + ` ${currentVolume}%`;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🔊 Current Volume')
            .setDescription(volumeBar)
            .setFooter({ text: 'Use !volume [0-100] to change the volume' })
        ]
      });
    }

    // Parse volume argument
    const volume = parseInt(args[0]);

    if (isNaN(volume) || volume < 0 || volume > 100) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Please provide a valid volume between 0 and 100!')
        ]
      });
    }

    // Check if user is the one who requested the current song or has manage messages permission
    const hasPermission = message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      (queue.currentSong && queue.currentSong.requestedBy.id === message.author.id);

    if (!hasPermission) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ You can only change volume for songs you requested, or you need Manage Messages permission!')
        ]
      });
    }

    try {
      // Set the volume (convert from 0-100 to 0-1)
      const newVolume = volume / 100;
      queue.volume = newVolume;

      // Update the current audio resource volume if it exists
      if (queue.player.state.status === AudioPlayerStatus.Playing) {
        const resource = queue.player.state.resource;
        if (resource && resource.volume) {
          resource.volume.setVolume(newVolume);
        }
      }

      const volumeBar = '🔊 ' + '█'.repeat(Math.floor(volume / 10)) + '░'.repeat(10 - Math.floor(volume / 10)) + ` ${volume}%`;

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle('🔊 Volume Updated')
            .setDescription(volumeBar)
        ]
      });
    } catch (error) {
      console.error('Error setting volume:', error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Error setting the volume!')
        ]
      });
    }
  },
};
