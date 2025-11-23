const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'shop',
    description: 'View and buy items',
    usage: '[buy <item_id>]',
    async execute(message, args, client, prefix, db) {
        if (args[0] === 'buy') {
            const itemId = parseInt(args[1]);
            if (isNaN(itemId)) return message.reply('Please provide a valid item ID.');

            const item = await db.getShopItem(message.guild.id, itemId);
            if (!item) return message.reply('Item not found.');

            const economy = await db.getEconomy(message.author.id, message.guild.id);
            if (economy.wallet < item.price) return message.reply('You do not have enough money.');

            await db.updateBalance(message.author.id, message.guild.id, -item.price);

            // Give role if item has one
            if (item.role_id) {
                const role = message.guild.roles.cache.get(item.role_id);
                if (role) {
                    await message.member.roles.add(role);
                }
            }

            return message.reply(`You bought **${item.name}** for $${item.price}!`);
        }

        const items = await db.getShopItems(message.guild.id);
        const embed = new EmbedBuilder()
            .setTitle('Shop')
            .setColor('#00FF00');

        if (items.length === 0) {
            embed.setDescription('No items available in the shop.');
        } else {
            items.forEach(item => {
                embed.addFields({
                    name: `${item.name} (ID: ${item.id})`,
                    value: `Price: $${item.price}\n${item.description}`
                });
            });
        }

        message.channel.send({ embeds: [embed] });
    }
};
