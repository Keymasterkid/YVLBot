const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'beg',
    description: 'Beg for money',
    async execute(message, args, client, prefix, db) {
        const user = message.author;
        const economy = await db.getEconomy(user.id, message.guild.id);

        // Cooldown check (e.g., 5 minutes)
        const cooldown = 5 * 60 * 1000;
        const lastBeg = economy ? economy.last_beg : 0;
        if (Date.now() - lastBeg < cooldown) {
            const remaining = cooldown - (Date.now() - lastBeg);
            const minutes = Math.ceil(remaining / 60000);
            return message.reply(`You can beg again in ${minutes} minutes.`);
        }

        await db.updateBeg(user.id, message.guild.id);

        // 70% chance to get money
        const success = Math.random() < 0.7;

        if (success) {
            const amount = Math.floor(Math.random() * 200) + 10; // $10 - $210
            await db.updateBalance(user.id, message.guild.id, amount);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`You begged and received **$${amount}**.`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } else {
            const responses = [
                "Stop begging!",
                "Get a job!",
                "I don't have any change.",
                "Go away."
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription(response)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        }
    }
};
