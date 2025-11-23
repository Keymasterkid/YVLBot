const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'baltop',
    description: 'View the richest users',
    aliases: ['rich', 'leaderboard'],
    async execute(message, args, client, db) {
        const leaderboard = await db.getLeaderboard(message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('Richest Users')
            .setColor('#FFD700');

        if (leaderboard.length === 0) {
            embed.setDescription('No data available.');
        } else {
            const description = leaderboard.map((entry, index) => {
                const total = entry.wallet + entry.bank;
                return `${index + 1}. **${entry.username || 'Unknown'}**: $${total.toLocaleString()}`;
            }).join('\n');
            embed.setDescription(description);
        }

        message.channel.send({ embeds: [embed] });
    }
};
