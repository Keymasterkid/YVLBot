const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  name: 'nekogif',
  description: 'Get a random neko gif',
  async execute(message) {
    try {
      // Make a request to the nekos.life API for a random neko gif
      const response = await axios.get('https://nekos.life/api/v2/img/ngif');

      // Get the gif URL from the response
      const gifUrl = response.data.url;

      // Create an embed with the neko gif
      const embed = new EmbedBuilder()
        .setColor('#ff66b2')
        .setTitle('Random Neko GIF')
        .setImage(gifUrl)
        .setFooter({ text: 'Enjoy your neko gif!' });

      // Send the embed to the channel
      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching neko gif:', error);
      message.reply('There was an error fetching the neko gif.');
    }
  },
};
