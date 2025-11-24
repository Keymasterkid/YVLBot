const { EmbedBuilder, version } = require('discord.js');
const os = require('os');

module.exports = {
  name: 'botinfo',
  description: 'Displays detailed information about the bot',
  execute(message, args, client) {
    try {
      // Bot uptime in a more readable format
      const formatUptime = (uptime) => {
        const seconds = Math.floor((uptime / 1000) % 60);
        const minutes = Math.floor((uptime / (1000 * 60)) % 60);
        const hours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      };

      // Latency calculation
      const latency = Date.now() - message.createdTimestamp;
      const apiLatency = Math.round(client.ws.ping);

      // System Information
      const systemInfo = `${os.type()} ${os.arch()} (${os.platform()})`;

      // Bot information embed
      const botInfoEmbed = new EmbedBuilder()
        .setColor('#00b0f4')
        .setTitle('🤖 Bot Information')
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(`Here’s all the relevant information about **${client.user.tag}**`)
        .addFields(
          { name: '🤖 Bot Name', value: client.user.tag || 'N/A', inline: true },
          { name: '🆔 Bot ID', value: client.user.id || 'N/A', inline: true },
          { name: '📅 Created On', value: client.user.createdAt.toDateString() || 'N/A', inline: true },
          { name: '💻 Server Count', value: `${client.guilds.cache.size.toLocaleString()}`, inline: true },
          { name: '👥 User Count', value: `${client.users.cache.size.toLocaleString()}`, inline: true },
          { name: '⚙️ Discord.js Version', value: `v${version}`, inline: true },
          { name: '⏲️ Uptime', value: formatUptime(client.uptime), inline: true },
          { name: '📊 Latency', value: `${latency}ms`, inline: true },
          { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true },
          { name: '🖥️ System Info', value: systemInfo, inline: false }
        )
        .setFooter({ text: 'YVLBot By OG69 Dev™', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      message.channel.send({ embeds: [botInfoEmbed] });
    } catch (error) {
      console.error('Error while executing botinfo command:', error);
      message.reply('⚠️ There was an error while retrieving bot information. Please try again later.');
    }
  },
};
