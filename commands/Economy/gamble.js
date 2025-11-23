const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'gamble',
    description: 'Gamble your money',
    usage: '<amount|all>',
    aliases: ['bet'],
    async execute(message, args, client, prefix, db) {
        const user = message.author;
        const economy = await db.getEconomy(user.id, message.guild.id);
        const wallet = economy ? economy.wallet : 0;

        if (args.length === 0) {
            return message.reply('Please specify an amount to gamble.');
        }

        let amount = 0;
        if (args[0].toLowerCase() === 'all') {
            amount = wallet;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) {
            return message.reply('Please enter a valid amount.');
        }

        if (amount > wallet) {
            return message.reply("You don't have that much money in your wallet.");
        }

        if (amount < 50) {
            return message.reply("Minimum bet is $50.");
        }

        // 45% chance to win (house edge)
        const win = Math.random() < 0.45;

        if (win) {
            await db.updateBalance(user.id, message.guild.id, amount); // Add winnings (original amount stays, plus win amount)

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('You Won!')
                .setDescription(`You gambled **$${amount.toLocaleString()}** and won! You now have **$${(wallet + amount).toLocaleString()}**.`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } else {
            await db.updateBalance(user.id, message.guild.id, -amount); // Lose bet

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('You Lost!')
                .setDescription(`You gambled **$${amount.toLocaleString()}** and lost. You now have **$${(wallet - amount).toLocaleString()}**.`)
                .setTimestamp();

            message.reply({ embeds: [embed] });
        }
    }
};
