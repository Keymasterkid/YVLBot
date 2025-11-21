const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Displays the XP and level leaderboard'),

  async execute(interaction, db) {
    // Check if command is used in DMs
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ This command can only be used in servers, not in DMs!',
        ephemeral: true
      });
    }

    if (!db) {
      return interaction.reply({
        content: '⚠️ Database connection error. Please try again later.',
        ephemeral: true
      });
    }

    try {
      const serverId = interaction.guild.id;

      const rows = await new Promise((resolve, reject) => {
        db.all(`
          SELECT u.username, ul.xp, ul.level 
          FROM user_levels ul
          JOIN users u ON ul.user_id = u.id
          WHERE ul.server_id = ?
          ORDER BY ul.level DESC, ul.xp DESC
          LIMIT 10
        `, [serverId], (err, rows) => {
          if (err) {
            console.error('Error fetching leaderboard:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      if (!rows || rows.length === 0) {
        return interaction.reply({
          content: 'No data available for the leaderboard yet. Start chatting to earn XP! 🚀',
          ephemeral: true
        });
      }

      let leaderboard = '';
      rows.forEach((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        leaderboard += `${medal} **#${index + 1}** - ${user.username}: Level ${user.level} (XP: ${user.xp})\n`;
      });

      const leaderboardEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🏆 Server Leaderboard 🏆')
        .setDescription(leaderboard)
        .setFooter({ text: 'Keep chatting to climb the ranks! 🚀' })
        .setTimestamp();

      await interaction.reply({ embeds: [leaderboardEmbed] });
    } catch (error) {
      console.error('Error in leaderboard command:', error);
      await interaction.reply({
        content: '⚠️ There was an error fetching the leaderboard. Please try again later.',
        ephemeral: true
      });
    }
  }
};
