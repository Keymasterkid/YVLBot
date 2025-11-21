const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'servers',
  description: 'Lists all servers the bot is in and allows the bot to leave a server. (Admin only)',
  async execute(message, args, client, prefix, db) {
    const userId = message.author.id;

    try {
      // Check if the user is an admin
      const userData = await db.get('SELECT is_admin FROM users WHERE id = ?', [userId]);
      const isAdmin = userData ? userData.is_admin : 0;

      if (!isAdmin) {
        return message.reply('You must be an admin to use this command.');
      }

      // Handle listing servers
      if (args[0] === 'list') {
        const guilds = client.guilds.cache;
        if (guilds.size === 0) {
          return message.reply('The bot is not in any servers.');
        }

        // Create an embed for the server list
        const serverList = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle('Bot Servers')
          .setDescription('List of servers the bot is currently in:')
          .setFooter({ text: `Total servers: ${guilds.size}` });

        guilds.forEach((guild) => {
          const owner = guild.members.cache.get(guild.ownerId); // Get the owner of the guild
          const ownerTag = owner ? owner.user.tag : 'Unknown'; // Fallback if owner is not cached
          serverList.addFields({ 
            name: `${guild.name} (ID: ${guild.id})`, // Display server name and ID
            value: `Owner: ${ownerTag} (ID: ${guild.ownerId})`, 
            inline: false 
          });
        });

        message.channel.send({ embeds: [serverList] });
      }

      // Handle leaving a server
      else if (args[0] === 'leave') {
        const serverId = args[1];
        if (!serverId) {
          return message.reply('Please provide the server ID you want the bot to leave.');
        }

        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
          return message.reply('I am not in that server or the server ID is invalid.');
        }

        await guild.leave();
        message.reply(`I have left the server: **${guild.name}**.`);
      } else {
        return message.reply('Invalid command. Use `!servers list` to list all servers or `!servers leave <server_id>` to make me leave a server.');
      }
    } catch (error) {
      console.error('Error executing servers command:', error);
      message.reply(`There was an error executing the command: ${error.message}`);
    }
  },
};
