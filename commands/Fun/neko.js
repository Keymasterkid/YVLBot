const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  name: 'neko',
  description: 'Get a random neko image',
  async execute(message) {
    try {
      // Make a request to the nekos.life API for a random neko image
      const response = await axios.get('https://nekos.life/api/neko');

      // Get the image URL from the response
      const imageUrl = response.data.neko;

      // Create an embed with the neko image
      const embed = new EmbedBuilder()
        .setColor('#ff66b2')
        .setTitle('Random Neko')
        .setImage(imageUrl)
        .setFooter({ text: 'Here’s your cute neko!' });

      // Send the embed to the channel
      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching neko image:', error);
      message.reply('There was an error fetching the neko image.');
    }
  },
};
