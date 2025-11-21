const { EmbedBuilder } = require('discord.js'); // Import EmbedBuilder for v14

module.exports = {
  name: 'ppsize',
  description: 'Check your pp size or the pp size of a mentioned user!',
  execute(message, args) {
    let user = message.author;

    if (args.length > 0) {
      const mention = message.mentions.users.first();
      if (mention) {
        user = mention;
      } else {
        message.reply('Invalid user mention!');
        return;
      }
    }

    const ppSize = Math.floor(Math.random() * 11); // Generate a random pp size between 0 and 10

    if (ppSize === 0) {
      const noPPMessage = `Sorry ${user}, you don't have a pp. 😔`;
      message.channel.send(noPPMessage);
    } else {
      const ppEmbed = new EmbedBuilder() // Use EmbedBuilder for v14
        .setColor('#3498db')
        .setTitle('PP Size Checker')
        .setDescription(`${user.toString()}'s PP Size: 8${'='.repeat(ppSize)}D`)
        .setFooter({ text: 'PP Size Command' });

      message.channel.send({ embeds: [ppEmbed] });
    }
  },
};
