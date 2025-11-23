const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'withdraw',
    description: 'Withdraw money from your bank',
    usage: '<amount|all>',
    aliases: ['with'],
    async execute(message, args, client, prefix, db) {
        const user = message.author;
        const economy = await db.getEconomy(user.id, message.guild.id);
        const bank = economy ? economy.bank : 0;

        if (args.length === 0) {
            return message.reply('Please specify an amount to withdraw.');
        }

        let amount = 0;
        if (args[0].toLowerCase() === 'all') {
            amount = bank;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) {
            return message.reply('Please enter a valid amount.');
        }

        if (amount > bank) {
            return message.reply("You don't have that much money in your bank.");
        }

        await db.updateBalance(user.id, message.guild.id, amount, -amount);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Withdrawal Successful')
            .setDescription(`You have withdrawn **$${amount.toLocaleString()}** from your bank.`)
            .addFields(
                { name: 'Wallet', value: `$${((economy ? economy.wallet : 0) + amount).toLocaleString()}`, inline: true },
                { name: 'Bank', value: `$${(bank - amount).toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
};
