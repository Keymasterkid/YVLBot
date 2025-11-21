const { EmbedBuilder } = require('discord.js');

// Array of hits
const hits = [
  "a pillow",
  "a hammer",
  "a rubber chicken",
  "a banana",
  "a baseball bat",
  "a book",
  "a dildo",
  "his dick"
];

module.exports = {
  name: 'hit',
  description: 'Hit someone with a random object!',
  execute(message) {
    // Get the mentioned user or return an error if no one is mentioned
    const targetMember = message.mentions.members.first();

    if (!targetMember) {
      return message.reply('Please mention someone to hit!');
    }

    // Get a random hit from the hits array
    const randomHit = hits[Math.floor(Math.random() * hits.length)];

    // Construct and send an embed with the hit information
    const hitEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Hit Command')
      .setDescription(`${message.author} hits ${targetMember} with ${randomHit}.`)
      .setTimestamp();

    message.channel.send({ embeds: [hitEmbed] });
  },
};
