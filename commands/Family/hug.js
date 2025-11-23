const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'hug',
    description: 'Hug another user',
    usage: '<@user>',
    async execute(message, args, client, prefix, db) {
        const user = message.author;
        const target = message.mentions.users.first();

        if (!target) {
            return message.reply('Please mention someone to hug.');
        }

        if (target.id === user.id) {
            return message.reply("You can't hug yourself (but here's a virtual hug from me!).");
        }

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setDescription(`**${user.username}** hugs **${target.username}**! 🤗`)
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
};
