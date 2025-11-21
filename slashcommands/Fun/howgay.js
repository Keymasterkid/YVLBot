const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('howgay')
    .setDescription('Check how gay someone is')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to check. If not specified, it will check yourself.')
    ),

  async execute(interaction) {
    // Check if a user is specified or default to the command user
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Generate a random percentage for the "howgay" value
    const howGayValue = Math.floor(Math.random() * 101);

    // Create an embed to display the result
    const embed = new EmbedBuilder()
      .setColor('#ff69b4')
      .setTitle('How Gay Am I?')
      .setDescription(`${targetUser} is ${howGayValue}% gay. 🏳️‍🌈`)
      .setFooter({ text: 'This is just for fun!' });

    // Reply with the embed
    await interaction.reply({ embeds: [embed] });
  },
};
