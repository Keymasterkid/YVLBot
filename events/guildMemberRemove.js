const { EmbedBuilder } = require('discord.js');

module.exports = (client, db) => {
  console.log('[MEMBERLEAVE] Member leave event handler initialized');
  
  // Check if database is properly passed
  if (!db) {
    console.error('[MEMBERLEAVE] Database object is null or undefined');
    return;
  }
  
  client.on('guildMemberRemove', async (member) => {
    console.log(`[MEMBERLEAVE] Member left: ${member.user.tag} (${member.id}) from server: ${member.guild.name}`);
    
    if (!member || !member.user || !member.guild) {
      console.error('[MEMBERLEAVE] Member, user, or guild is undefined in guildMemberRemove event.');
      return;
    }

    const guild = member.guild;

    try {
      console.log(`[MEMBERLEAVE] Fetching leave channel for ${guild.name} (${guild.id})`);
      
      // Fetch the leave channel from the database
      const query = 'SELECT leave_channel FROM servers WHERE server_id = ?';
      const row = await db.get(query, [guild.id]);
      
      console.log(`[MEMBERLEAVE] Server data retrieved:`, row);

      if (!row || !row.leave_channel) {
        console.log(`[MEMBERLEAVE] No leave channel set for server: ${guild.name}`);
        return; // Ignore servers without a leave channel
      }

      const leaveChannelId = row.leave_channel;
      let leaveChannel = guild.channels.cache.get(leaveChannelId);

      if (!leaveChannel) {
        console.log(`[MEMBERLEAVE] Leave channel not cached. Attempting to fetch from API with ID: ${leaveChannelId}`);
        try {
          leaveChannel = await guild.channels.fetch(leaveChannelId);
          console.log(`[MEMBERLEAVE] Fetched leave channel: ${leaveChannel.name}`);
        } catch (fetchError) {
          console.error(`[MEMBERLEAVE] Failed to fetch leave channel with ID ${leaveChannelId} for server: ${guild.name}`, fetchError);
          return;
        }
      } else {
        console.log(`[MEMBERLEAVE] Leave channel retrieved from cache: ${leaveChannel.name}`);
      }

      if (!leaveChannel.isTextBased()) {
        console.log(`[MEMBERLEAVE] Leave channel with ID ${leaveChannelId} is not a text-based channel.`);
        return;
      }

      // Check bot permissions
      const permissions = leaveChannel.permissionsFor(guild.members.me);
      if (!permissions.has('SendMessages')) { // Updated permission name for Discord.js v14
        console.error(`[MEMBERLEAVE] Bot does not have permission to send messages in channel: ${leaveChannel.name}`);
        return;
      }

      // Create leave message embed
      const leaveEmbed = new EmbedBuilder()
        .setColor('#FF0000') // Red color for leave messages
        .setTitle('😢 Goodbye!')
        .setDescription(`We're sad to see you go, ${member.user.tag}. Thank you for being a part of **${guild.name}**!`)
        .addFields({ name: 'Member Count:', value: `${guild.memberCount}`, inline: true })
        .setTimestamp()
        .setFooter({ text: 'We hope to see you again soon!' });

      // Send leave message
      const sentMessage = await leaveChannel.send({ embeds: [leaveEmbed] });
      console.log(`[MEMBERLEAVE] Sent leave message for ${member.user.tag} in ${guild.name}`);
      return sentMessage;

    } catch (error) {
      console.error('[MEMBERLEAVE] Error executing leave message:', error);
    }
  });
};
