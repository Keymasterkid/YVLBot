const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'serverinfo',
  description: 'Displays detailed information about the server.',
  async execute(message, args, client, prefix) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    const server = message.guild;

    try {
      const owner = await client.users.fetch(server.ownerId);

      // Calculate the number of real members (excluding bots) and the bot count
      const humanCount = server.members.cache.filter(member => !member.user.bot).size;
      const botCount = server.members.cache.filter(member => member.user.bot).size;
      const totalMembers = humanCount + botCount;

      // Server creation and region formatting
      const createdAt = server.createdAt.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const region = server.preferredLocale || 'Unknown';

      // Prepare the embed
      const serverEmbed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle(`Server Info: ${server.name}`)
        .setThumbnail(server.iconURL({ dynamic: true, size: 1024 }))
        .setDescription(`Here's a detailed look at **${server.name}**!`)
        .addFields(
          { name: '👑 Owner', value: `${owner.tag} (${owner.id})`, inline: true },
          { name: '🌍 Server ID', value: `${server.id}`, inline: true },
          { name: '👥 Members', value: `${humanCount} human / ${botCount} bots`, inline: true },
          { name: '🌎 Region', value: region, inline: true },
          { name: '💬 Text Channels', value: `${server.channels.cache.filter(c => c.type === 0).size}`, inline: true },
          { name: '🔊 Voice Channels', value: `${server.channels.cache.filter(c => c.type === 2).size}`, inline: true },
          { name: '✨ Boost Level', value: `Tier ${server.premiumTier}`, inline: true },
          { name: '💎 Boosts', value: `${server.premiumSubscriptionCount}`, inline: true },
          { name: '📅 Created On', value: createdAt, inline: true },
          { name: '📊 Total Members', value: `${totalMembers}`, inline: true }
        )
        .setFooter({ text: `Requested by ${message.author.tag} | YVLBot By OG69 Dev™`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

      // Send the embed to the channel
      message.channel.send({ embeds: [serverEmbed] });
    } catch (error) {
      console.error('Error fetching server info:', error);
      message.reply('⚠️ There was an error fetching server information. Please try again later.');
    }
  },
};
