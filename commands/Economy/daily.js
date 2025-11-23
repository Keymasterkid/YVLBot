const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'daily',
    description: 'Claim your daily reward',
    async execute(message, args, client, db) {
        const economy = await db.getEconomy(message.author.id, message.guild.id);
        const cooldown = 86400000; // 24 hours
        const now = Date.now();

        if (now - economy.last_daily < cooldown) {
            const remaining = cooldown - (now - economy.last_daily);
            const hours = Math.ceil(remaining / 3600000);
            return message.reply(`You can claim your daily reward in ${hours} hours.`);
        }

        const reward = 500;
        await db.updateBalance(message.author.id, message.guild.id, reward);
        await db.updateDaily(message.author.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('Daily Reward')
            .setDescription(`You claimed your daily reward of **$${reward}**!`)
            .setColor('#00FF00');

        message.channel.send({ embeds: [embed] });
    }
};
