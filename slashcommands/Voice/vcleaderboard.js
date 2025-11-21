const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vcleaderboard')
    .setDescription('Displays the VC leaderboard based on hours spent in voice channels'),
  
  async execute(interaction, db) {
    // Check if command is used in DMs
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ This command can only be used in servers, not in DMs!',
        ephemeral: true
      });
    }

    const pageSize = 10; // Entries per page
    let page = 0; // Start at page 0

    // Function to fetch leaderboard for a specific page
    const fetchLeaderboardPage = async (serverId, page) => {
      const offset = page * pageSize;
      try {
        return await db.all(
          'SELECT user_id, hours, minutes FROM vc_activity WHERE server_id = ? ORDER BY hours DESC, minutes DESC LIMIT ? OFFSET ?', 
          [serverId, pageSize, offset]
        );
      } catch (error) {
        console.error('Error fetching VC leaderboard:', error.message);
        interaction.reply('⚠️ There was an error fetching the VC leaderboard. Please try again later.');
        return [];
      }
    };

    // Function to create the leaderboard embed
    const generateLeaderboardEmbed = (rows, page, serverId) => {
      if (rows.length === 0) {
        return new EmbedBuilder().setDescription('📉 No data available for the VC leaderboard yet.');
      }

      let leaderboard = '';
      rows.forEach((entry, index) => {
        leaderboard += `**#${page * pageSize + index + 1}** - <@${entry.user_id}>: **${entry.hours} hours, ${entry.minutes} minutes**\n`;
      });

      return new EmbedBuilder()
        .setColor('#2ECC71')  // Modern green color for positivity and clarity
        .setTitle(`🎧 VC Leaderboard - Page ${page + 1} 🎧`)
        .setDescription(leaderboard)
        .addFields({
          name: 'View Full Leaderboard Online',
          value: `[Click here to view the full VC leaderboard](https://yvlbot.com/server/${serverId}/vc_leaderboard)`,
        })
        .setFooter({ text: 'Keep chatting in voice channels to climb the leaderboard! 📈' })
        .setTimestamp();  // Adds the current time to the footer
    };

    const updateMessage = async (interaction, page) => {
      const serverId = interaction.guild.id;
      const rows = await fetchLeaderboardPage(serverId, page);

      const embed = generateLeaderboardEmbed(rows, page, serverId);
      const components = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('last')
          .setLabel('◀️ Last')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0), // Disable "Last" button on first page
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(rows.length < pageSize) // Disable "Next" button if less than pageSize entries
      );

      await interaction.editReply({ embeds: [embed], components: [components] });
    };

    try {
      const serverId = interaction.guild.id; // Get server ID
      const rows = await fetchLeaderboardPage(serverId, page);

      if (rows.length === 0) {
        return interaction.reply('⚠️ No data available for the VC leaderboard yet. Be sure to chat in voice channels to get on the board!');
      }

      const embed = generateLeaderboardEmbed(rows, page, serverId);
      const components = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('last')
          .setLabel('◀️ Last')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true), // Disabled on first page
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [components] });

      // Collector for button interactions
      const filter = (i) => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.customId === 'next') {
          page++;
        } else if (buttonInteraction.customId === 'last') {
          page--;
        }
        await updateMessage(interaction, page);
        await buttonInteraction.deferUpdate(); // Acknowledge the interaction
      });

      collector.on('end', () => {
        // Disable buttons after timeout
        interaction.editReply({ components: [] });
      });
    } catch (error) {
      console.error('Error fetching VC leaderboard:', error.message);
      interaction.reply('⚠️ There was an error fetching the VC leaderboard. Please try again later.');
    }
  },
};
