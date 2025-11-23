const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ship',
    description: 'Check compatibility between two users',
    usage: '<@user1> [@user2]',
    async execute(message, args, client, prefix, db) {
        let user1 = message.author;
        let user2 = message.mentions.users.first();

        if (!user2) {
            return message.reply('Please mention at least one user to ship.');
        }

        if (message.mentions.users.size > 1) {
            const users = message.mentions.users.first(2);
            user1 = users[0];
            user2 = users[1];
        }

        // Generate a consistent percentage based on user IDs
        const combinedIds = BigInt(user1.id) + BigInt(user2.id);
        const percentage = Number(combinedIds % 101n);

        let description = '';
        if (percentage < 25) {
            description = '💔 No chance...';
        } else if (percentage < 50) {
            description = '😐 Maybe?';
        } else if (percentage < 75) {
            description = '❤️ Good couple!';
        } else {
            description = '💖 Perfect match!';
        }

        const progressBar = '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));

        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('Ship Compatibility')
            .setDescription(`**${user1.username}** ❤️ **${user2.username}**\n\n**${percentage}%** [${progressBar}]\n\n${description}`)
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
};
