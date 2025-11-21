const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'vcleaderboard',
  description: 'Displays the VC leaderboard based on hours spent in voice channels',
  async execute(message, args, client, prefix, db) {
    console.log(`[VCLEADERBOARD] Command started by ${message.author.tag} in ${message.guild.name}`);
    
    if (!db) {
      console.error('[VCLEADERBOARD] Database object is undefined or null');
      return message.reply('⚠️ Database connection error. Please try again later.');
    }

    const pageSize = 10; // Entries per page
    let page = 0; // Starting page

    const fetchLeaderboardPage = async (page) => {
      try {
        console.log(`[VCLEADERBOARD] Fetching page ${page} for server ${message.guild.id}`);
        // Fetch the leaderboard for the current page
        const offset = page * pageSize;
        
        // Use Promise-based db.all method instead of callback
        const query = `
          SELECT u.username, va.hours, va.minutes 
          FROM vc_activity va
          JOIN users u ON va.user_id = u.id
          WHERE va.server_id = ?
          ORDER BY va.hours DESC, va.minutes DESC 
          LIMIT ${pageSize} OFFSET ${offset}`;
          
        const rows = await db.all(query, [message.guild.id]);
        console.log(`[VCLEADERBOARD] Fetched ${rows?.length || 0} results`);
        return rows || [];
      } catch (error) {
        console.error('[VCLEADERBOARD] Error in fetchLeaderboardPage:', error);
        throw error;
      }
    };

    const generateLeaderboardEmbed = (rows, page, serverId) => {
      if (!rows || rows.length === 0) {
        return new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription('📉 No data available for the VC leaderboard yet.');
      }

      // Format the leaderboard data
      let leaderboard = '';
      rows.forEach((entry, index) => {
        leaderboard += `**#${page * pageSize + index + 1}** - ${entry.username}: **${entry.hours} hours, ${entry.minutes} minutes**\n`;
      });

      // Create the leaderboard embed
      return new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`🎧 VC Leaderboard - Page ${page + 1} 🎧`)
        .setDescription(leaderboard)
        .addFields({
          name: 'View Full Leaderboard Online',
          value: `[Click here to view the full VC leaderboard](https://yvlbot.com/server/${serverId}/vc_leaderboard)`,
        })
        .setFooter({ text: 'Keep chatting in voice channels to climb the leaderboard! 📈' })
        .setTimestamp();
    };

    const updateMessage = async (message, page) => {
      try {
        console.log(`[VCLEADERBOARD] Updating message to page ${page}`);
        const rows = await fetchLeaderboardPage(page);
        const serverId = message.guild.id;

        // Generate embed and buttons
        const embed = generateLeaderboardEmbed(rows, page, serverId);
        const components = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('last')
            .setLabel('◀️ Last')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(rows.length < pageSize)
        );

        await message.edit({ embeds: [embed], components: [components] });
        console.log('[VCLEADERBOARD] Message updated successfully');
      } catch (error) {
        console.error('[VCLEADERBOARD] Error in updateMessage:', error);
        await message.edit({ 
          content: '⚠️ There was an error updating the leaderboard. Please try again later.',
          embeds: [],
          components: []
        });
      }
    };

    try {
      console.log('[VCLEADERBOARD] Fetching initial leaderboard data');
      const rows = await fetchLeaderboardPage(page);

      if (!rows || rows.length === 0) {
        console.log('[VCLEADERBOARD] No data available for leaderboard');
        return message.reply('⚠️ No data available for the VC leaderboard yet. Be sure to chat in voice channels to get on the board!');
      }

      const serverId = message.guild.id;
      const embed = generateLeaderboardEmbed(rows, page, serverId);
      const components = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('last')
          .setLabel('◀️ Last')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rows.length < pageSize)
      );

      console.log('[VCLEADERBOARD] Sending initial leaderboard message');
      const sentMessage = await message.channel.send({ embeds: [embed], components: [components] });
      console.log('[VCLEADERBOARD] Initial message sent successfully');

      // Collector for button interaction
      const filter = (interaction) => interaction.user.id === message.author.id;
      const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async (interaction) => {
        try {
          console.log(`[VCLEADERBOARD] Button ${interaction.customId} clicked by ${interaction.user.tag}`);
          if (interaction.customId === 'next') {
            page++;
          } else if (interaction.customId === 'last') {
            page--;
          }
          await interaction.deferUpdate();
          await updateMessage(sentMessage, page);
        } catch (error) {
          console.error('[VCLEADERBOARD] Error handling button interaction:', error);
          if (!interaction.replied) {
            await interaction.reply({ 
              content: '⚠️ There was an error updating the leaderboard. Please try again later.',
              ephemeral: true 
            });
          }
        }
      });

      collector.on('end', () => {
        console.log('[VCLEADERBOARD] Button collector ended');
        sentMessage.edit({ components: [] }).catch(error => {
          console.error('[VCLEADERBOARD] Error removing buttons after collector end:', error);
        });
      });
    } catch (error) {
      console.error('[VCLEADERBOARD] Error in vcleaderboard command:', error);
      return message.reply('⚠️ There was an error fetching the VC leaderboard. Please try again later.');
    }
  }
};
