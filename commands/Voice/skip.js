const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'skip',
  description: 'Skip the current song',
  usage: '!skip',
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
    if (!player || !player.playing) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('❌ There is nothing playing right now!')
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
      player.skip();

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
