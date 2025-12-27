const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'volume',
  description: 'Set the playback volume (0-100)',
  usage: '!volume [0-100]',
  aliases: ['vol'],
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

    // If no volume specified, show current volume
    if (!args.length) {
      const currentVolume = player.volume;
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

    try {
      player.setVolume(volume);

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
