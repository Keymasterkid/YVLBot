const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'slap',
  description: 'Slap someone!',
  execute(message, args) {
    const mention = message.mentions.users.first();

    // Array of random slap GIFs
    const slapGifs = [
      'https://media.giphy.com/media/Gf3AUz3eBNbTW/giphy.gif',
      'https://media.giphy.com/media/jLeyZWgtwgr2U/giphy.gif',
      'https://media1.tenor.com/m/wOCOTBGZJyEAAAAC/chikku-neesan-girl-hit-wall.gif',
      'https://media.giphy.com/media/xUNd9HZq1itMkiK652/giphy.gif',
      'https://media1.tenor.com/m/nVvUhW4FBxcAAAAd/slap.gif',
    ];

    // Select a random GIF from the array
    const randomGif = slapGifs[Math.floor(Math.random() * slapGifs.length)];

    if (mention) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle(`${message.author.username} slaps ${mention.username}!`)
        .setImage(randomGif) // Add random slap GIF
        .setFooter({ text: 'Ouch! That must’ve hurt!' });

      message.channel.send({ embeds: [embed] });
    } else {
      message.reply('You need to mention someone to slap!');
    }
  },
};
