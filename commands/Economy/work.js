const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'work',
    description: 'Work to earn money',
    async execute(message, args, client, prefix, db) {
        const economy = await db.getEconomy(message.author.id, message.guild.id);
        const cooldown = 3600000; // 1 hour
        const now = Date.now();

        if (now - economy.last_work < cooldown) {
            const remaining = cooldown - (now - economy.last_work);
            const minutes = Math.ceil(remaining / 60000);
            return message.reply(`You can work again in ${minutes} minutes.`);
        }

        const earnings = Math.floor(Math.random() * 500) + 100;
        await db.updateBalance(message.author.id, message.guild.id, earnings);
        await db.updateWork(message.author.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('Work Complete')
            .setDescription(`You worked hard and earned **$${earnings}**!`)
            .setColor('#00FF00');

        message.channel.send({ embeds: [embed] });
    }
};
