const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'disown',
    description: 'Disown a child',
    usage: '<user>',
    async execute(message, args, client, prefix, db) {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Please mention a child to disown.');

        const authorFamily = await db.getFamily(message.author.id, message.guild.id);
        if (!authorFamily.children.includes(target.id)) return message.reply('This user is not your child.');

        const targetFamily = await db.getFamily(target.id, message.guild.id);

        const newChildren = authorFamily.children.filter(id => id !== target.id);
        const newParents = targetFamily.parents.filter(id => id !== message.author.id);

        await db.updateFamily(message.author.id, message.guild.id, { children: newChildren });
        await db.updateFamily(target.id, message.guild.id, { parents: newParents });

        message.channel.send(`💔 ${message.author} has disowned ${target}.`);
    }
};
