const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: 'adopt',
    description: 'Adopt another user',
    usage: '<user>',
    async execute(message, args, client, prefix, db) {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Please mention a user to adopt.');
        if (target.id === message.author.id) return message.reply('You cannot adopt yourself.');
        if (target.bot) return message.reply('You cannot adopt a bot.');

        const authorFamily = await db.getFamily(message.author.id, message.guild.id);
        const targetFamily = await db.getFamily(target.id, message.guild.id);

        // Check if already related (basic check)
        if (authorFamily.children.includes(target.id)) return message.reply('You have already adopted this user.');
        if (targetFamily.parents.length > 0) return message.reply('This user is already adopted by someone else.');

        const embed = new EmbedBuilder()
            .setTitle('Adoption Request')
            .setDescription(`${target}, ${message.author} wants to adopt you! Do you accept?`)
            .setColor('#00BFFF');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept_adoption')
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('reject_adoption')
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
                return i.reply({ content: 'This request is not for you.', ephemeral: true });
            }

            if (i.customId === 'accept_adoption') {
                const newChildren = [...authorFamily.children, target.id];
                let newParents = [message.author.id];
                let successMsg = `🎉 ${message.author} has adopted ${target}! 🎉`;

                // If adopter is married, add partner as parent too
                if (authorFamily.partner_id) {
                    const partnerFamily = await db.getFamily(authorFamily.partner_id, message.guild.id);
                    const partnerChildren = [...partnerFamily.children, target.id];

                    newParents.push(authorFamily.partner_id);
                    await db.updateFamily(authorFamily.partner_id, message.guild.id, { children: partnerChildren });
                    successMsg = `🎉 ${message.author} and their partner <@${authorFamily.partner_id}> have adopted ${target}! 🎉`;
                }

                await db.updateFamily(message.author.id, message.guild.id, { children: newChildren });
                await db.updateFamily(target.id, message.guild.id, { parents: newParents });

                await i.update({ content: 'Adoption accepted!', components: [] });
                message.channel.send(`🎉 ${message.author} has adopted ${target}! 🎉`);
            } else {
                await i.update({ content: 'Adoption rejected.', components: [] });
                message.channel.send(`${target} rejected the adoption.`);
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                reply.edit({ content: 'Adoption request timed out.', components: [] });
            }
        });
    }
};
