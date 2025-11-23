const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'balance',
    description: 'Check your wallet and bank balance',
    usage: '[user]',
    aliases: ['bal', 'money'],
    async execute(message, args, client, db) {
        const target = message.mentions.users.first() || message.author;
        const economy = await db.getEconomy(target.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Balance`)
            .addFields(
                { name: 'Wallet', value: `$${economy.wallet.toLocaleString()}`, inline: true },
                { name: 'Bank', value: `$${economy.bank.toLocaleString()}`, inline: true },
                { name: 'Total', value: `$${(economy.wallet + economy.bank).toLocaleString()}`, inline: true }
            )
            .setColor('#00FF00')
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
};
