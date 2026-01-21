const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: 'marry',
    description: 'Propose to another user',
    usage: '<user>',
    async execute(message, args, client, prefix, db) {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Please mention a user to marry.');
        if (target.id === message.author.id) return message.reply('You cannot marry yourself.');
        if (target.bot) return message.reply('You cannot marry a bot.');

        const authorFamily = await db.getFamily(message.author.id, message.guild.id);
        if (authorFamily.partner_id) return message.reply('You are already married!');

        const targetFamily = await db.getFamily(target.id, message.guild.id);
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
                // Sync children
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
    }
};
