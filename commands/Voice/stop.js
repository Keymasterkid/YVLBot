const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'stop',
  description: 'Stop playback and clear the queue',
  usage: '!stop',
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(message, args, client) {
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

    const player = client.moonlink.players.get(message.guild.id);
    if (!player) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setDescription('🎵 There is nothing playing right now!')
        ]
      });
    }

    if (player.voiceChannelId !== channel.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ I need to be in the same voice channel as you!')
        ]
      });
    }

    try {
      player.destroy();

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
