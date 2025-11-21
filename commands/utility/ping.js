const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping',
    description: 'Check the bot\'s latency and API response time',
    cooldown: 5,
    async execute(message) {
        const startTime = Date.now();
        const msg = await message.reply('Pinging...');
        const endTime = Date.now();
        
        const apiLatency = endTime - startTime;
        const wsLatency = message.client.ws.ping;
        
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🏓 Pong!')
            .addFields(
                { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
                { name: 'WebSocket Latency', value: `${wsLatency}ms`, inline: true },
                { name: 'Total Latency', value: `${apiLatency + wsLatency}ms`, inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        await msg.edit({ content: '', embeds: [embed] });
    }
}; 