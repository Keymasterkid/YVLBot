const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'avatar',
  description: 'Show the avatar of yourself or someone else',
  execute(message, args) {
    // Get the mentioned user or default to the message author
    const targetUser = message.mentions.users.first() || message.author;

    // Create an embed for the avatar
    const avatarEmbed = new EmbedBuilder()
      .setColor('#7289da')
      .setTitle(`🖼️ ${targetUser.username}'s Avatar`)
      .setDescription(`Here is the avatar of ${targetUser.username}.`)
      .setImage(targetUser.displayAvatarURL({ dynamic: true, size: 4096 }))
      .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    // Send the embed to the channel
    message.channel.send({ embeds: [avatarEmbed] });
  },
};
