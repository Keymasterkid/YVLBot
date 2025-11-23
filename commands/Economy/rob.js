const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'rob',
    description: 'Attempt to rob another user',
    usage: '<@user>',
    async execute(message, args, client, prefix, db) {
        const user = message.author;
        const target = message.mentions.users.first();

        if (!target) {
            return message.reply('Please mention a user to rob.');
        }

        if (target.id === user.id) {
            return message.reply("You can't rob yourself.");
        }

        if (target.bot) {
            return message.reply("You can't rob bots.");
        }

        const economy = await db.getEconomy(user.id, message.guild.id);
        const targetEconomy = await db.getEconomy(target.id, message.guild.id);

        // Cooldown check (e.g., 1 hour)
        const cooldown = 60 * 60 * 1000;
        const lastRob = economy ? economy.last_rob : 0;
        if (Date.now() - lastRob < cooldown) {
            const remaining = cooldown - (Date.now() - lastRob);
            const minutes = Math.ceil(remaining / 60000);
            return message.reply(`You can rob again in ${minutes} minutes.`);
        }

        const wallet = economy ? economy.wallet : 0;
        const targetWallet = targetEconomy ? targetEconomy.wallet : 0;

        if (wallet < 500) {
            return message.reply("You need at least $500 in your wallet to attempt a robbery.");
        }

        if (targetWallet < 500) {
            return message.reply("This user doesn't have enough money to be worth robbing.");
        }

        // 40% chance of success
        const success = Math.random() < 0.4;

        await db.updateRob(user.id, message.guild.id);

        if (success) {
            // Steal 10-50% of their wallet
            const percent = Math.floor(Math.random() * 41) + 10;
            const amount = Math.floor(targetWallet * (percent / 100));

            await db.updateBalance(user.id, message.guild.id, amount);
            await db.updateBalance(target.id, message.guild.id, -amount);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Robbery Successful!')
                .setDescription(`You robbed ${target.username} and got away with **$${amount.toLocaleString()}**!`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } else {
            // Pay fine of 10-30% of own wallet
            const percent = Math.floor(Math.random() * 21) + 10;
            const fine = Math.floor(wallet * (percent / 100));

            await db.updateBalance(user.id, message.guild.id, -fine);
            // Optional: Give fine to target? Or just burn it? Let's burn it for now.

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Robbery Failed!')
                .setDescription(`You were caught trying to rob ${target.username} and paid a fine of **$${fine.toLocaleString()}**.`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        }
    }
};
