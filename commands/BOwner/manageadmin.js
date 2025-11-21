const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'manageadmin',
  description: 'Manage admin/owner privileges',
  async execute(message, args, client, prefix, db) {
    const userData = await getUserData(db, message.author.id);

    if (!userData || !userData.is_owner) {
      return message.reply('You must be the bot owner to use this command. Use `manageadmin help` for more information.');
    }

    if (args[0] === 'help') {
      return message.reply(
        `**Manageadmin Command Help:**
        \n**Usage:**
        \`- manageadmin grant <@user>\`: Grant admin privileges to a user
        \`- manageadmin revoke <@user>\`: Revoke admin privileges from a user
        \`- manageadmin list\`: List all admins and owners
        \`- manageadmin make_owner <@user>\`: Promote a user to owner
        \`- manageadmin remove_owner <@user>\`: Demote an owner
        \n**Note:** You must be the bot owner to use these commands.`
      );
    }

    if (args.length < 2 && args[0] !== 'list') {
      return message.reply('Please provide a valid subcommand and a user mention. Use `manageadmin help` for more information.');
    }

    const subcommand = args[0].toLowerCase();
    const userMention = message.mentions.users.first();

    if (!userMention && subcommand !== 'list') {
      return message.reply('Please mention a user to manage their admin/owner privileges.');
    }

    const userId = userMention ? userMention.id : null;

    try {
      switch (subcommand) {
        case 'grant':
          await grantAdmin(db, userId);
          message.reply(`${userMention.tag} has been granted admin privileges.`);
          break;
        case 'revoke':
          await revokeAdmin(db, userId);
          message.reply(`${userMention.tag} has had their admin privileges revoked.`);
          break;
        case 'list':
          const admins = await listAdmins(db);
          const owners = await listOwners(db);
          const adminList = admins.map((admin) => `<@${admin.id}>`).join(', ');
          const ownerList = owners.map((owner) => `<@${owner.id}>`).join(', ');

          const listEmbed = new EmbedBuilder()
            .setColor('#7289da')
            .setTitle('Admin and Owner List')
            .addFields(
              { name: 'Admins', value: adminList || 'No admins found.' },
              { name: 'Owners', value: ownerList || 'No owners found.' }
            )
            .setFooter({ text: 'Admin and Owner List' });
          message.channel.send({ embeds: [listEmbed] });
          break;
        case 'make_owner':
          if (await confirmMakeOwner(message, userMention.tag)) {
            await makeOwner(db, userId);
            message.reply(`${userMention.tag} has been promoted to owner.`);
          } else {
            message.reply('Action canceled.');
          }
          break;
        case 'remove_owner':
          if (await confirmRemoveOwner(message, userMention.tag)) {
            await removeOwner(db, userId);
            message.reply(`${userMention.tag} has been demoted from owner.`);
          } else {
            message.reply('Action canceled.');
          }
          break;
        default:
          message.reply('Invalid subcommand. Available subcommands: grant, revoke, list, make_owner, remove_owner. Use `manageadmin help` for more details.');
      }
    } catch (error) {
      console.error('Error executing manageadmin command:', error);
      message.reply('An error occurred while executing the command. Please try again later.');
    }
  },
};

async function getUserData(db, userId) {
  return await db.get('SELECT * FROM users WHERE id = ?', [userId]);
}

async function confirmMakeOwner(message, target) {
  const confirmationEmbed = new EmbedBuilder()
    .setColor('#7289da')
    .setTitle('Confirmation')
    .setDescription(`Are you sure you want to make ${target} an owner? This will grant them full control over the bot. (Type 'yes' to confirm)`);

  await message.channel.send({ embeds: [confirmationEmbed] });

  const filter = (response) => {
    return ['yes', 'no'].includes(response.content.toLowerCase()) && response.author.id === message.author.id;
  };

  const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });

  const response = collected.first().content.toLowerCase();
  return response === 'yes';
}

async function confirmRemoveOwner(message, target) {
  const confirmationEmbed = new EmbedBuilder()
    .setColor('#7289da')
    .setTitle('Confirmation')
    .setDescription(`Are you sure you want to remove owner privileges from ${target}? This will revoke their full control over the bot. (Type 'yes' to confirm)`);

  await message.channel.send({ embeds: [confirmationEmbed] });

  const filter = (response) => {
    return ['yes', 'no'].includes(response.content.toLowerCase()) && response.author.id === message.author.id;
  };

  const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });

  const response = collected.first().content.toLowerCase();
  return response === 'yes';
}

async function grantAdmin(db, userId) {
  await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [userId]);
}

async function revokeAdmin(db, userId) {
  await db.run('UPDATE users SET is_admin = 0 WHERE id = ?', [userId]);
}

async function listAdmins(db) {
  return await db.all('SELECT id FROM users WHERE is_admin = 1');
}

async function makeOwner(db, userId) {
  await db.run('UPDATE users SET is_owner = 1 WHERE id = ?', [userId]);
}

async function removeOwner(db, userId) {
  await db.run('UPDATE users SET is_owner = 0 WHERE id = ?', [userId]);
}

async function listOwners(db) {
  return await db.all('SELECT id FROM users WHERE is_owner = 1');
}
