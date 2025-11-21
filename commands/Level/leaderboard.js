const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'leaderboard', // Command name
  description: 'Displays the XP and level leaderboard', // Command description

  async execute(message, args, client, prefix, db) {
    console.log(`[LEADERBOARD] Command started by ${message.author.tag} in ${message.guild.name}`);
    
    if (!db) {
      console.error('[LEADERBOARD] Database object is undefined or null');
      return message.reply('⚠️ Database connection error. Please try again later.');
    }

    try {
      const serverId = message.guild.id; // Get the server ID
      console.log(`[LEADERBOARD] Fetching leaderboard for server ${serverId}`);

      // Use Promise-based db.all method
      const query = `
        SELECT u.username, ul.xp, ul.level 
        FROM user_levels ul
        JOIN users u ON ul.user_id = u.id
        WHERE ul.server_id = ?
        ORDER BY ul.level DESC, ul.xp DESC
        LIMIT 10
      `;
      
      const rows = await db.all(query, [serverId]);
      console.log(`[LEADERBOARD] Retrieved ${rows?.length || 0} entries for leaderboard`);

      if (!rows || rows.length === 0) {
        console.log(`[LEADERBOARD] No data available for server ${serverId}`);
        return message.reply('No data available for the leaderboard yet. Start chatting to earn XP! 🚀');
      }

      // Format the leaderboard data
      let leaderboard = '';
      rows.forEach((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        leaderboard += `${medal} **#${index + 1}** - ${user.username}: Level ${user.level} (XP: ${user.xp})\n`;
      });

      // Create a leaderboard embed
      const leaderboardEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🏆 Server Leaderboard 🏆')
        .setDescription(leaderboard)
        .setFooter({ text: 'Keep chatting to climb the ranks! 🚀' })
        .setTimestamp();

      console.log(`[LEADERBOARD] Sending leaderboard embed for ${message.guild.name}`);
      return message.reply({ embeds: [leaderboardEmbed] });
    } catch (error) {
      console.error('[LEADERBOARD] Error in leaderboard command:', error);
      return message.reply('⚠️ There was an error fetching the leaderboard. Please try again later.');
    }
  },
};
