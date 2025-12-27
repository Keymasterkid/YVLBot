const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'queue',
  description: 'Show the current music queue',
  usage: '!queue',
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(message, args, client) {
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

    const embed = new EmbedBuilder()
      .setTitle('🎵 Music Queue')
      .setColor(0x3498DB)
      .setTimestamp();

    // Add current song
    if (player.current) {
      const curReq = player.current.requestedBy && typeof player.current.requestedBy === 'object' ? player.current.requestedBy.id || player.current.requestedBy : player.current.requestedBy;
      embed.addFields({
        name: '🎵 Now Playing',
        value: `[${player.current.title}](${player.current.url})\nDuration: ${player.current.isStream ? '🔴 Live Stream' : new Date(player.current.duration).toISOString().substr(11, 8)} | Requested by: <@${curReq || 'Unknown'}>`,
        inline: false
      });
    }

    // Add queue information
    if (player.queue.size > 0) {
      const queueList = player.queue.slice(0, 10).map((track, index) => {
        const reqBy = track.requestedBy && typeof track.requestedBy === 'object' ? track.requestedBy.id || track.requestedBy : track.requestedBy;
        return `${index + 1}. [${track.title}](${track.url}) - ${track.isStream ? '🔴 Live Stream' : new Date(track.duration).toISOString().substr(11, 8)} (<@${reqBy || 'Unknown'}>)`;
      }).join('\n');

      embed.addFields({
        name: `📋 Up Next (${player.queue.size} songs)`,
        value: queueList,
        inline: false
      });

      if (player.queue.size > 10) {
        embed.addFields({
          name: '📝 And more...',
          value: `+${player.queue.size - 10} more songs in queue`,
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

    // Add player settings
    embed.addFields(
      { name: '🔊 Volume', value: `${player.volume}%`, inline: true }
    );

    message.reply({ embeds: [embed] });
  },
};
