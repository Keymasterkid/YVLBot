const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'whois',
  description: 'Get information about a user',
  async execute(message, args, client, prefix, db) {
    // Check if a user was mentioned, if not, default to the message author
    const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]) || message.author;

    // Fetch additional information about the user in the server
    const member = message.guild.members.cache.get(targetUser.id);

    // Fetch admin/owner status and blacklisted status from the database
    try {
      const userData = await db.get('SELECT is_admin, is_owner, is_blacklisted FROM users WHERE id = ?', [targetUser.id]);

      if (!userData) {
        return message.reply('User data not found in the database.');
      }

      const { is_admin, is_owner, is_blacklisted } = userData;

      // Check if the user has a GIF avatar
      const avatarURL = targetUser.displayAvatarURL({ dynamic: true, format: 'png' });

      // Create an embed with user information
      const whoisEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('👤 User Information')
        .addFields(
          { name: 'Username', value: `${targetUser.tag}`, inline: true },
          { name: 'User ID', value: `${targetUser.id}`, inline: true },
          { name: 'Nickname', value: member ? `${member.displayName}` : 'Not available', inline: true },
          { name: '📅 Joined Server', value: member ? `${member.joinedAt.toDateString()}` : 'Not available', inline: true },
          { name: '🗓️ Account Created', value: `${targetUser.createdAt.toDateString()}`, inline: true }
        );

      // Conditionally show "Blacklisted" only if true
      if (is_blacklisted) whoisEmbed.addFields({ name: '🚫 Blacklisted', value: 'Yes', inline: true });

      // Only show "Bot Admin" and "Bot Owner" if true
      if (is_admin) whoisEmbed.addFields({ name: '👮 Bot Admin', value: 'Yes', inline: true });
      if (is_owner) whoisEmbed.addFields({ name: '👑 Bot Owner', value: 'Yes', inline: true });

      whoisEmbed.setThumbnail(avatarURL);
      whoisEmbed.setFooter({ text: 'Whois Command' });

      // Send the embed to the channel
      message.channel.send({ embeds: [whoisEmbed] });
    } catch (error) {
      console.error('Error executing whois command:', error.message);
      message.reply('⚠️ There was an error executing the command. Please try again later.');
    }
  }
};
