const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const responses = [
  'It is certain.',
  'It is decidedly so.',
  'Without a doubt.',
  'Yes - definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  'Don\'t count on it.',
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8ball a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question for the magic 8ball')
        .setRequired(true)),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const response = responses[Math.floor(Math.random() * responses.length)];

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🎱 Magic 8 Ball')
      .addFields(
        { name: 'Question', value: question },
        { name: 'Answer', value: response }
      )
      .setFooter({ text: 'The magic 8ball has spoken!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
}; 