const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'voicehelp',
  description: 'Show help for voice commands',
  usage: '!voicehelp',
  aliases: ['vchelp', 'musichelp'],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(message, args) {
    const embed = new EmbedBuilder()
      .setTitle('🎵 Voice Commands Help')
      .setColor(0x3498DB)
      .setDescription('Here are all the available voice commands:')
      .addFields(
        {
          name: '🎵 !play <URL>',
          value: 'Play a song from YouTube\nExample: `!play https://youtube.com/watch?v=...`',
          inline: false
        },
        {
          name: '⏭️ !skip',
          value: 'Skip the current song (only for requester or users with Manage Messages)',
          inline: false
        },
        {
          name: '⏹️ !stop',
          value: 'Stop playback and clear the queue (only for requester or users with Manage Messages)',
          inline: false
        },
        {
          name: '📋 !queue',
          value: 'Show the current music queue and now playing',
          inline: false
        },
        {
          name: '🔊 !volume [0-100]',
          value: 'Set or show the playback volume\nExample: `!volume 50` or just `!volume` to see current',
          inline: false
        },
        {
          name: '🔗 !join',
          value: 'Make the bot join your voice channel',
          inline: false
        }
      )
      .addFields(
        {
          name: '🎮 Control Buttons',
          value: 'When a song is playing, you\'ll see control buttons:\n⏸️ Pause/Resume • ⏭️ Skip • ⏹️ Stop • 🔁 Loop',
          inline: false
        },
        {
          name: '📊 !vcleaderboard',
          value: 'Show voice channel activity leaderboard',
          inline: false
        }
      )
      .setFooter({ text: 'Voice commands require you to be in a voice channel' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
