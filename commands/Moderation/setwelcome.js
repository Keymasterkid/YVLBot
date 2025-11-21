const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'setwelcome',
  description: 'Sets the welcome channel for the server. Mention a channel or provide a channel name.',
  category: 'Moderation',
  async execute(message, args, client, prefix, db) {
    // Check if the user has the required permission
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply('You need the `ManageChannels` permission to use this command.');
    }

    // Check if a channel is mentioned
    const channelMention = message.mentions.channels.first();
    
    // If no channel is mentioned, check for the channel name in args
    let channel;
    if (channelMention) {
      channel = channelMention;
    } else if (args[0]) {
      const channelName = args[0].replace('#', '').trim(); // Remove # if present
      channel = message.guild.channels.cache.find(ch => ch.name === channelName && ch.type === 'GUILD_TEXT');
    }

    if (!channel) {
      return message.reply('Please mention a valid text channel or provide a valid text channel name (e.g., `#channel-name`).');
    }

    // Check if the bot has permission to send messages in the channel
    const permissions = channel.permissionsFor(message.guild.members.me);
    if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
      return message.reply(`I don't have permission to send messages in <#${channel.id}>.`);
    }

    try {
      const serverId = message.guild.id;
      const existingEntry = await db.get('SELECT * FROM servers WHERE server_id = ?', [serverId]);

      if (existingEntry) {
        // Update the existing welcome channel
        await db.run('UPDATE servers SET welcome_channel = ? WHERE server_id = ?', [channel.id, serverId]);
        message.reply(`Welcome channel has been updated to <#${channel.id}>.`);
      } else {
        // Insert a new server entry with the welcome channel
        await db.run('INSERT INTO servers (server_id, welcome_channel) VALUES (?, ?)', [serverId, channel.id]);
        message.reply(`Welcome channel has been set to <#${channel.id}>.`);
      }

      // Send a confirmation message in the welcome channel
      await channel.send('This channel has been set as the Welcome channel! 🎉');

    } catch (error) {
      console.error('Error setting welcome channel:', error);
      message.reply('There was an error trying to set the welcome channel. Please try again later.');
    }
  },
};
