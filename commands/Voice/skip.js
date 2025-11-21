const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'skip',
  description: 'Skip the current song',
  usage: '!skip',
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
            .setColor('Red')
            .setDescription('❌ There is nothing playing right now!')
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
            .setDescription('❌ You can only skip songs you requested, or you need Manage Messages permission!')
        ]
      });
    }

    try {
      // Stop the current song to trigger playNext
      queue.player.stop();
      
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setDescription('⏭️ Skipped the current song!')
        ]
      });
    } catch (error) {
      console.error('Error skipping song:', error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ Error skipping the song!')
        ]
      });
    }
  },
};
