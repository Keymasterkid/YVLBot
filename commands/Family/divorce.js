const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'divorce',
    description: 'Divorce your partner',
    async execute(message, args, client, db) {
        const family = await db.getFamily(message.author.id, message.guild.id);
        if (!family.partner_id) return message.reply('You are not married!');

        const partnerId = family.partner_id;
        const partnerFamily = await db.getFamily(partnerId, message.guild.id);

        // Handle custody
        const children = family.children || [];
        let authorNewChildren = [];
        let partnerNewChildren = [];

        for (const childId of children) {
            const childFamily = await db.getFamily(childId, message.guild.id);
            const parents = childFamily.parents || [];

            // Determine primary parent (first in list)
            const primaryParentId = parents[0];

            if (primaryParentId === message.author.id) {
                // Author keeps child
                authorNewChildren.push(childId);
                await db.updateFamily(childId, message.guild.id, { parents: [message.author.id] });
            } else if (primaryParentId === partnerId) {
                // Partner keeps child
                partnerNewChildren.push(childId);
                await db.updateFamily(childId, message.guild.id, { parents: [partnerId] });
            } else {
                // Fallback: Author keeps child if unknown
                authorNewChildren.push(childId);
                await db.updateFamily(childId, message.guild.id, { parents: [message.author.id] });
            }
        }

        await db.updateFamily(message.author.id, message.guild.id, {
            partner_id: null,
            marriage_date: null,
            children: authorNewChildren
        });
        await db.updateFamily(partnerId, message.guild.id, {
            partner_id: null,
            marriage_date: null,
            children: partnerNewChildren
        });

        message.channel.send(`💔 ${message.author} has divorced < @${partnerId}>.\nChildren have been returned to their primary parents.`);
    }
};
