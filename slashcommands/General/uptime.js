const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms'); // Optional: Use ms package to format time easily

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows the bot\'s uptime'),

  async execute(interaction) {
    // Get the bot's uptime in milliseconds
    const uptimeMs = interaction.client.uptime;

    // Format the uptime nicely (hours, minutes, seconds)
    const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((uptimeMs % (60 * 1000)) / 1000);

    // Construct the uptime string
    const formattedUptime = 
      `${days}d ${hours}h ${minutes}m ${seconds}s`;

    // Create an embed for the response
    const embed = new EmbedBuilder()
      .setColor('#00FF00') // Green color
      .setTitle('Bot Uptime')
      .setDescription(`The bot has been up for **${formattedUptime}**.`)
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    // Reply with the embed
    await interaction.reply({ embeds: [embed] });
  },
};
