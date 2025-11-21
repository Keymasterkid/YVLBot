const { EmbedBuilder } = require('discord.js'); // Import for Discord.js v14

module.exports = {
  name: 'kiss',
  description: 'Give someone a kiss!',
  async execute(message, args) {
    // List of anime kissing GIFs
    const kissGifs = [
      'https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWZmdXI3enVtdm9yazZqd2dyZXRleTl5Nmt1ZjNta2RpcDh6MGlhYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/bGm9FuBCGg4SY/giphy.gif',
      'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZGQ5OHYwMTd1ZXd1dWVvMm1hMno0dnJ0aDFoejFkODRtanR4bThwdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zkppEMFvRX5FC/giphy.gif',
      'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDZlanVtbHhuNWp6bjJ6bW4xejMwbnVnbnIybXBzOGlvMTN4YXllaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/FqBTvSNjNzeZG/giphy.gif',
      'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExYWU0MDExN3dxMTdldXFxcWxkamJ4bDFkcnVrazEwbTR6ajhsNzkxdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/jR22gdcPiOLaE/giphy.gif',
      'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ212ZHVidzlibHpmMHZvNHB2Z2xzYnBnYWdsM3RsdTRqdXlnbjF2MyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/11rWoZNpAKw8w/giphy.gif'
    ];

    // Randomly select a GIF from the list
    const randomGif = kissGifs[Math.floor(Math.random() * kissGifs.length)];

    // Check if a user is mentioned
    const mention = message.mentions.users.first();

    // Create an embed to display the result
    const embed = new EmbedBuilder()
      .setColor('#ff69b4')
      .setTitle('Kiss!')
      .setDescription(mention ? `*${message.author.username} kisses ${mention.username}* 😘` : `*${message.author.username} sends a kiss* 😘`)
      .setImage(randomGif);

    // Send the embed to the channel
    message.channel.send({ embeds: [embed] });
  },
};
