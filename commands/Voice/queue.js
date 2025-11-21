const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'queue',
  description: 'Show the current music queue',
  usage: '!queue',
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

    const embed = new EmbedBuilder()
      .setTitle('🎵 Music Queue')
      .setColor(0x3498DB)
      .setTimestamp();

    // Add current song
    if (queue.currentSong) {
      embed.addFields({
        name: '🎵 Now Playing',
        value: `[${queue.currentSong.title}](${queue.currentSong.url})\nDuration: ${queue.currentSong.duration} | Requested by: ${queue.currentSong.requestedBy.username}`,
        inline: false
      });
    }

    // Add queue information
    if (queue.songs.length > 0) {
      const queueList = queue.songs.slice(0, 10).map((song, index) => {
        return `${index + 1}. [${song.title}](${song.url}) - ${song.duration} (${song.requestedBy.username})`;
      }).join('\n');

      embed.addFields({
        name: `📋 Up Next (${queue.songs.length} songs)`,
        value: queueList,
        inline: false
      });

      if (queue.songs.length > 10) {
        embed.addFields({
          name: '📝 And more...',
          value: `+${queue.songs.length - 10} more songs in queue`,
          inline: false
        });
      }
    } else {
      embed.addFields({
        name: '📋 Queue',
        value: 'No songs in queue',
        inline: false
      });
    }

    // Add queue settings
    embed.addFields(
      { name: '🔁 Loop', value: queue.loop ? 'Enabled' : 'Disabled', inline: true },
      { name: '🔊 Volume', value: `${Math.round(queue.volume * 100)}%`, inline: true }
    );

    message.reply({ embeds: [embed] });
  },
};
