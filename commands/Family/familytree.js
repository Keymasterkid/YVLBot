const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'familytree',
    description: 'View your family tree',
    aliases: ['tree', 'family'],
    async execute(message, args, client, prefix, db) {
        try {
            if (!db || typeof db.getFamily !== 'function') {
                return message.reply('Database error: Family methods not available.');
            }

            const target = message.mentions.users.first() || message.author;
            const family = await db.getFamily(target.id, message.guild.id);

            if (!family) {
                return message.reply('Error retrieving family data.');
            }

            const partner = family.partner_id ? `<@${family.partner_id}>` : 'None';
            const children = (family.children && Array.isArray(family.children) && family.children.length > 0) 
                ? family.children.map(id => `<@${id}>`).join(', ') 
                : 'None';
            const parents = (family.parents && Array.isArray(family.parents) && family.parents.length > 0) 
                ? family.parents.map(id => `<@${id}>`).join(', ') 
                : 'None';

            const embed = new EmbedBuilder()
                .setTitle(`${target.username}'s Family Tree`)
                .addFields(
                    { name: 'Partner', value: partner, inline: true },
                    { name: 'Parents', value: parents, inline: true },
                    { name: 'Children', value: children }
                )
                .setColor('#00BFFF')
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in familytree command:', error);
            message.reply('There was an error executing this command.');
        }
    }
};
