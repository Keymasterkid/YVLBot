const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'howgay',
  description: 'Check how gay someone is',
  async execute(message, args) {
    // Check if a user is mentioned
    const targetUser = message.mentions.users.first() || message.author;

    // Generate a random percentage for the "howgay" value
    const howGayValue = Math.floor(Math.random() * 101);

    // Create an embed to display the result
    const embed = new EmbedBuilder()
      .setColor('#ff69b4')
      .setTitle('How Gay Am I?')
      .setDescription(`${targetUser} is ${howGayValue}% gay. 🏳️‍🌈`)
      .setFooter({ text: 'This is just for fun!' });

    // Send the embed to the channel
    await message.channel.send({ embeds: [embed] });
  },
};
