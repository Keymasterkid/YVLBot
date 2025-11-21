const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for kicking')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction, db) {
    if (!db) {
      return interaction.reply({
        content: '⚠️ Database connection error. Please try again later.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
      return interaction.reply({
        content: '❌ That user is not in this server!',
        ephemeral: true
      });
    }

    if (!member.kickable) {
      return interaction.reply({
        content: '❌ I cannot kick that user! They may have a higher role than me.',
        ephemeral: true
      });
    }

    try {
      // Log the kick in the database
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO moderation_logs (user_id, server_id, moderator_id, action, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, interaction.guild.id, interaction.user.id, 'kick', reason, Date.now()],
          (err) => {
            if (err) {
              console.error('Error logging kick:', err);
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
              .setTitle('👢 You have been kicked')
              .setDescription(`You were kicked from ${interaction.guild.name}`)
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

      // Kick the user
      await member.kick(reason);

      // Send confirmation embed
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('👢 User Kicked')
        .setDescription(`${user.tag} has been kicked from the server`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Moderator', value: interaction.user.tag }
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
      console.error('Error in kick command:', error);
      await interaction.reply({
        content: '❌ There was an error kicking the user. Please try again later.',
        ephemeral: true
      });
    }
  },
}; 