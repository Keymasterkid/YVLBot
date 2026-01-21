const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'manageblacklist',
  description: 'Add or remove users from the bot\'s blacklist',
  async execute(message, args, client, prefix, db) {
    const adminData = await getUserData(db, message.author.id);

    if (!adminData || !adminData.is_admin) {
      return message.reply('You must be an bot admin to use this command.');
    }

    if (args.length < 2 || (args[0] !== 'add' && args[0] !== 'remove')) {
      return message.reply(
        `**Usage:**
        \`${prefix}manageblacklist add <@user>\`: Add a user to the blacklist
        \`${prefix}manageblacklist remove <@user>\`: Remove a user from the blacklist`
      );
    }

    const subcommand = args[0].toLowerCase();
    const userMention = message.mentions.users.first();

    if (!userMention) {
      return message.reply('Please mention a valid user.');
    }

    const userId = userMention.id;

    try {
      const targetData = await getUserData(db, userId);

      if (!targetData) {
        return message.reply('That user is not registered in the database.');
      }

      // Protection checks
      if (targetData.is_owner) {
        return message.reply('You cannot blacklist the bot owner.');
      }

      if (targetData.is_admin) {
        return message.reply('You cannot blacklist another admin.');
      }

      if (subcommand === 'add') {
        await blacklistUser(db, userId, 1);
        message.reply(`${userMention.tag} has been added to the blacklist.`);
      } else {
        await blacklistUser(db, userId, 0);
        message.reply(`${userMention.tag} has been removed from the blacklist.`);
      }
    } catch (error) {
      console.error('Error managing blacklist:', error);
      message.reply('There was an error managing the blacklist.');
    }
  },
};

// Fetch user data
async function getUserData(db, userId) {
  return await db.get('SELECT * FROM users WHERE id = ?', [userId]);
}

// Set blacklist status
async function blacklistUser(db, userId, status) {
  await db.run(
    'UPDATE users SET is_blacklisted = ? WHERE id = ?',
    [status, userId]
  );
}