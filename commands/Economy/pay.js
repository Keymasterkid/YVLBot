const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'pay',
    description: 'Transfer money to another user',
    usage: '<user> <amount>',
    async execute(message, args, client, db) {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Please mention a user to pay.');

        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('Please provide a valid amount.');

        const economy = await db.getEconomy(message.author.id, message.guild.id);
        if (economy.wallet < amount) return message.reply('You do not have enough money.');

        await db.updateBalance(message.author.id, message.guild.id, -amount);
        await db.updateBalance(target.id, message.guild.id, amount);

        const embed = new EmbedBuilder()
            .setTitle('Payment Successful')
            .setDescription(`You paid **$${amount}** to ${target.username}.`)
            .setColor('#00FF00');

        message.channel.send({ embeds: [embed] });
    }
};
