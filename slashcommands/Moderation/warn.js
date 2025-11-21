const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for the warning')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, db) {
    if (!db) {
      return interaction.reply({
        content: '⚠️ Database connection error. Please try again later.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
      return interaction.reply({
        content: '❌ That user is not in this server!',
        ephemeral: true
      });
    }

    try {
      // Add warning to database
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO warnings (user_id, server_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)',
          [user.id, interaction.guild.id, interaction.user.id, reason, Date.now()],
          (err) => {
            if (err) {
              console.error('Error adding warning:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Get warning count
      const warningCount = await new Promise((resolve, reject) => {
        db.get(
          'SELECT COUNT(*) as count FROM warnings WHERE user_id = ? AND server_id = ?',
          [user.id, interaction.guild.id],
          (err, row) => {
            if (err) {
              console.error('Error getting warning count:', err);
              reject(err);
            } else {
              resolve(row?.count || 0);
            }
          }
        );
      });

      // Send DM to the user
      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#ffcc00')
              .setTitle('⚠️ You have been warned')
              .setDescription(`You received a warning in ${interaction.guild.name}`)
              .addFields(
                { name: 'Reason', value: reason },
                { name: 'Moderator', value: interaction.user.tag },
                { name: 'Total Warnings', value: warningCount.toString() }
              )
              .setTimestamp()
          ]
        });
      } catch (error) {
        console.error('Could not send DM to user:', error);
      }

      // Send confirmation embed
      const embed = new EmbedBuilder()
        .setColor('#ffcc00')
        .setTitle('⚠️ User Warned')
        .setDescription(`${user.tag} has been warned`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Moderator', value: interaction.user.tag },
          { name: 'Total Warnings', value: warningCount.toString() }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Send to log channel if configured
      const logChannelId = await new Promise((resolve, reject) => {
        db.get(
          'SELECT log_channel FROM servers WHERE server_id = ?',
          [interaction.guild.id],
          (err, row) => {
            if (err) {
              console.error('Error getting log channel:', err);
              reject(err);
            } else {
              resolve(row?.log_channel);
            }
          }
        );
      });

      if (logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        if (logChannel) {
          await logChannel.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error('Error in warn command:', error);
      await interaction.reply({
        content: '❌ There was an error warning the user. Please try again later.',
        ephemeral: true
      });
    }
  },
}; 