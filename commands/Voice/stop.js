const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'stop',
  description: 'Stop playback and clear the queue',
  usage: '!stop',
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

    // Check if user is the one who requested the current song or has manage messages permission
    const hasPermission = message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      (queue.currentSong && queue.currentSong.requestedBy.id === message.author.id);

    if (!hasPermission) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ You can only stop songs you requested, or you need Manage Messages permission!')
        ]
      });
    }

    try {
      // Clear the queue
      queue.songs = [];

      // Stop the player
      queue.player.stop();

      // Destroy the connection
      if (queue.connection) {
        queue.connection.destroy();
      }

      // Stop the collector
      if (queue.collector) {
        queue.collector.stop();
      }

      // Clear the control message
      if (queue.controlMessage) {
        try {
          await queue.controlMessage.edit({ components: [] });
        } catch (error) {
          console.error('Error clearing control message:', error);
        }
      }

      // Set playing to false
      queue.playing = false;

      // Remove the queue from the global map
      queues.delete(message.guild.id);

      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setDescription('⏹️ Stopped playback and cleared the queue!')
        ]
      });
    } catch (error) {
      console.error('Error stopping playback:', error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Error stopping playback!')
        ]
      });
    }
  },
};
