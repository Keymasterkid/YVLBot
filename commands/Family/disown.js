const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'disown',
    description: 'Disown a child',
    usage: '<user>',
    async execute(message, args, client, prefix, db) {
        try {
            if (!db || typeof db.getFamily !== 'function' || typeof db.updateFamily !== 'function') {
                return message.reply('Database error: Family methods not available.');
            }

            const target = message.mentions.users.first();
            if (!target) return message.reply('Please mention a child to disown.');

            const authorFamily = await db.getFamily(message.author.id, message.guild.id);
            if (!authorFamily || !authorFamily.children || !Array.isArray(authorFamily.children)) {
                return message.reply('Error retrieving your family data.');
            }

            if (!authorFamily.children.includes(target.id)) {
                return message.reply('This user is not your child.');
            }

            const targetFamily = await db.getFamily(target.id, message.guild.id);
            if (!targetFamily || !targetFamily.parents || !Array.isArray(targetFamily.parents)) {
                return message.reply('Error retrieving target family data.');
            }

            const newChildren = authorFamily.children.filter(id => id !== target.id);
            const newParents = targetFamily.parents.filter(id => id !== message.author.id);

            await db.updateFamily(message.author.id, message.guild.id, { children: newChildren });
            await db.updateFamily(target.id, message.guild.id, { parents: newParents });

            message.channel.send(`💔 ${message.author} has disowned ${target}.`);
        } catch (error) {
            console.error('Error in disown command:', error);
            message.reply('There was an error executing this command.');
        }
    }
};
