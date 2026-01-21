const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: 'marry',
    description: 'Propose to another user',
    usage: '<user>',
    async execute(message, args, client, prefix, db) {
        try {
            const target = message.mentions.users.first();
            if (!target) return message.reply('Please mention a user to marry.');
            if (target.id === message.author.id) return message.reply('You cannot marry yourself.');
            if (target.bot) return message.reply('You cannot marry a bot.');

        if (!db || typeof db.getFamily !== 'function' || typeof db.updateFamily !== 'function') {
            return message.reply('Database error: Family methods not available.');
        }

        const authorFamily = await db.getFamily(message.author.id, message.guild.id);
        if (!authorFamily) return message.reply('Error retrieving your family data.');
        if (authorFamily.partner_id) return message.reply('You are already married!');

        const targetFamily = await db.getFamily(target.id, message.guild.id);
        if (!targetFamily) return message.reply('Error retrieving target family data.');
        if (targetFamily.partner_id) return message.reply('That person is already married!');

        const embed = new EmbedBuilder()
            .setTitle('Marriage Proposal')
            .setDescription(`${target}, ${message.author} has proposed to you! Do you accept?`)
            .setColor('#FF69B4');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept_marriage')
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('reject_marriage')
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
            );

        const reply = await message.channel.send({ content: `${target}`, embeds: [embed], components: [row] });

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== target.id) {
                return i.reply({ content: 'This proposal is not for you.', ephemeral: true });
            }

            if (i.customId === 'accept_marriage') {
                try {
                    // Update both users' partner_id and set marriage date
                    await db.updateFamily(message.author.id, message.guild.id, {
                        partner_id: target.id,
                        marriage_date: Date.now()
                    });
                    await db.updateFamily(target.id, message.guild.id, {
                        partner_id: message.author.id,
                        marriage_date: Date.now()
                    });

                    // Sync children between partners
                    const updatedAuthorFamily = await db.getFamily(message.author.id, message.guild.id);
                    const updatedTargetFamily = await db.getFamily(target.id, message.guild.id);
                    
                    const allChildren = [...new Set([...updatedAuthorFamily.children, ...updatedTargetFamily.children])];
                    
                    await db.updateFamily(message.author.id, message.guild.id, { children: allChildren });
                    await db.updateFamily(target.id, message.guild.id, { children: allChildren });

                    // Update children's parents to include both partners
                    for (const childId of allChildren) {
                        const childFamily = await db.getFamily(childId, message.guild.id);
                        const parents = childFamily.parents || [];
                        if (!parents.includes(message.author.id)) parents.push(message.author.id);
                        if (!parents.includes(target.id)) parents.push(target.id);
                        await db.updateFamily(childId, message.guild.id, { parents: parents });
                    }

                    await i.update({ content: 'Proposal accepted!', components: [] });
                    message.channel.send(`💍 ${message.author} and ${target} are now married! 💍`);
                } catch (error) {
                    console.error('Error accepting marriage:', error);
                    await i.update({ content: 'There was an error processing the marriage.', components: [] });
                }
            } else {
                await i.update({ content: 'Proposal rejected.', components: [] });
                message.channel.send(`${target} rejected the proposal.`);
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                reply.edit({ content: 'Proposal timed out.', components: [] });
            }
        });
        } catch (error) {
            console.error('Error in marry command:', error);
            message.reply('There was an error executing this command.');
        }
    }
};
