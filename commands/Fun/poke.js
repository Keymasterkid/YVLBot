const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'poke',
  description: 'Poke someone!',
  execute(message, args) {
    const mention = message.mentions.users.first();

    // Array of random poke GIFs
    const pokeGifs = [
      'https://media1.tenor.com/m/3dOqO4vVlr8AAAAC/poke-anime.gif',
      'https://media1.tenor.com/m/t6ABAaRJEA0AAAAC/oreimo-ore-no-im%C5%8Dto-ga-konna-ni-kawaii-wake-ga-nai.gif',
      'https://media1.tenor.com/m/_vVL5fuzj4cAAAAC/nagi-no.gif',
      'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXRxeW16aTBjeGtheDJkY295b2h0bW9iMnhyanAweDIxdXdoaWZpbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LXTQN2kRbaqAw/giphy.webp',
    ];

    // Select a random GIF from the array
    const randomGif = pokeGifs[Math.floor(Math.random() * pokeGifs.length)];

    if (mention) {
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`${message.author.username} pokes ${mention.username}! 👉`)
        .setImage(randomGif) // Add random poke GIF
        .setFooter({ text: 'Poke poke poke!' });

      message.channel.send({ embeds: [embed] });
    } else {
      message.reply('You need to mention someone to poke!');
    }
  },
};
