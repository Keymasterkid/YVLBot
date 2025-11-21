const { EmbedBuilder } = require('discord.js'); // For discord.js v14

module.exports = {
  name: 'rank',
  description: 'Shows your current rank, level, and XP',
  async execute(message, args, client, prefix, db) {
    console.log(`[RANK] Command started by ${message.author.tag} in ${message.guild.name}`);
    
    if (!db) {
      console.error('[RANK] Database object is undefined or null');
      return message.reply('⚠️ Database connection error. Please try again later.');
    }

    try {
      const userId = message.author.id;
      const serverId = message.guild.id;
      console.log(`[RANK] Fetching rank for user ${userId} in server ${serverId}`);

      // First ensure the user exists in the database
      await db.addUserIfNotExists(userId, message.author.username);
      console.log(`[RANK] User existence verified in database`);

      // Use Promise-based db.get method
      const query = 'SELECT xp, level FROM user_levels WHERE user_id = ? AND server_id = ?';
      const row = await db.get(query, [userId, serverId]);
      console.log(`[RANK] User data retrieved:`, row || 'No data found');

      if (!row) {
        console.log(`[RANK] No XP data found for user ${userId}`);
        return message.reply('You don\'t have any XP yet. Start chatting to earn XP! 🚀');
      }

      const { xp, level } = row;
      const xpToNextLevel = level * 100; // Example: Level 1 requires 100 XP, level 2 requires 200 XP, etc.
      const progress = Math.min((xp / xpToNextLevel) * 100, 100);
      console.log(`[RANK] Calculated progress: Level ${level}, XP ${xp}, Progress ${progress.toFixed(1)}%`);

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`🏆 ${message.author.username}'s Rank 🏆`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: 'Level', value: `**${level}**`, inline: true },
          { name: 'XP', value: `**${xp}**`, inline: true },
          { name: 'Progress', value: `**${progress.toFixed(1)}%** to next level`, inline: false }
        )
        .setFooter({ text: 'Keep chatting to level up! 🚀' })
        .setTimestamp();

      console.log(`[RANK] Sending rank embed for ${message.author.tag}`);
      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('[RANK] Error in rank command:', error);
      return message.reply('⚠️ There was an error fetching your rank. Please try again later.');
    }
  },
};
