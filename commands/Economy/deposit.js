const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'deposit',
    description: 'Deposit money into your bank',
    usage: '<amount|all>',
    aliases: ['dep'],
    async execute(message, args, client, prefix, db) {
        const user = message.author;
        const economy = await db.getEconomy(user.id, message.guild.id);
        const wallet = economy ? economy.wallet : 0;

        if (args.length === 0) {
            return message.reply('Please specify an amount to deposit.');
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

        await db.updateBalance(user.id, message.guild.id, -amount, amount);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Deposit Successful')
            .setDescription(`You have deposited **$${amount.toLocaleString()}** into your bank.`)
            .addFields(
                { name: 'Wallet', value: `$${(wallet - amount).toLocaleString()}`, inline: true },
                { name: 'Bank', value: `$${((economy ? economy.bank : 0) + amount).toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
};
