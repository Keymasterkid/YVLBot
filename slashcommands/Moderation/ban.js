const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for banning')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Number of days of messages to delete (0-7)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction, db) {
    if (!db) {
      return interaction.reply({
        content: '⚠️ Database connection error. Please try again later.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const days = interaction.options.getInteger('days') || 0;
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
      return interaction.reply({
        content: '❌ That user is not in this server!',
        ephemeral: true
      });
    }

    if (!member.bannable) {
      return interaction.reply({
        content: '❌ I cannot ban that user! They may have a higher role than me.',
        ephemeral: true
      });
    }

    try {
      // Log the ban in the database
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO moderation_logs (user_id, server_id, moderator_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, interaction.guild.id, interaction.user.id, 'ban', reason, Date.now()],
          (err) => {
            if (err) {
              console.error('Error logging ban:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Send DM to the user
      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('🔨 You have been banned')
              .setDescription(`You were banned from ${interaction.guild.name}`)
              .addFields(
                { name: 'Reason', value: reason },
                { name: 'Moderator', value: interaction.user.tag }
              )
              .setTimestamp()
          ]
        });
      } catch (error) {
        console.error('Could not send DM to user:', error);
      }

      // Ban the user
      await member.ban({ reason, deleteMessageDays: days });

      // Send confirmation embed
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔨 User Banned')
        .setDescription(`${user.tag} has been banned from the server`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Moderator', value: interaction.user.tag },
          { name: 'Messages Deleted', value: `${days} days` }
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
      console.error('Error in ban command:', error);
      await interaction.reply({
        content: '❌ There was an error banning the user. Please try again later.',
        ephemeral: true
      });
    }
  },
}; 