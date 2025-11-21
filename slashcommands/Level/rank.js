const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Shows your current rank, level, and XP'),

  async execute(interaction, db) {
    if (!db) {
      return interaction.reply({
        content: '⚠️ Database connection error. Please try again later.',
        ephemeral: true
      });
    }

    try {
      const userId = interaction.user.id;
      const serverId = interaction.guild.id;

      const row = await new Promise((resolve, reject) => {
        db.get(
          'SELECT xp, level FROM user_levels WHERE user_id = ? AND server_id = ?',
          [userId, serverId],
          (err, row) => {
            if (err) {
              console.error('Error fetching user rank:', err);
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });

      if (!row) {
        return interaction.reply({
          content: 'You don\'t have any XP yet. Start chatting to earn XP! 🚀',
          ephemeral: true
        });
      }

      const { xp, level } = row;
      const xpToNextLevel = level * 100; // Example: Level 1 requires 100 XP, level 2 requires 200 XP, etc.
      const progress = Math.min((xp / xpToNextLevel) * 100, 100);

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`🏆 ${interaction.user.username}'s Rank 🏆`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: 'Level', value: `**${level}**`, inline: true },
          { name: 'XP', value: `**${xp}**`, inline: true },
          { name: 'Progress', value: `**${progress.toFixed(1)}%** to next level`, inline: false }
        )
        .setFooter({ text: 'Keep chatting to level up! 🚀' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in rank command:', error);
      await interaction.reply({
        content: '⚠️ There was an error fetching your rank. Please try again later.',
        ephemeral: true
      });
    }
  }
};
