const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'invite',
  description: 'Get an invite link to add the bot to your server.',
  execute(message, args, client, prefix) {
    try {
      const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=8`;

      const inviteEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Invite Me to Your Server!')
        .setDescription(`[Click here to invite the bot to your server](${inviteLink})`)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: `Requested by ${message.author.tag} | YVLBot By OG69 Dev™`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

      message.channel.send({ embeds: [inviteEmbed] });
    } catch (error) {
      console.error('Error while executing invite command:', error);
      message.reply('⚠️ There was an error generating the invite link. Please try again later.');
    }
  },
};
