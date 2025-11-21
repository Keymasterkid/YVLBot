const { EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    name: 'setlog',
    description: 'Set the log channel for moderation actions',
    usage: '!setlog #channel',
    permissions: ['Administrator'],
    async execute(message, args) {
        if (!message.mentions.channels.first()) {
            return message.reply('Please mention a channel to set as the log channel.');
        }

        const channel = message.mentions.channels.first();
        
        try {
            const success = await db.updateLogChannel(message.guild.id, channel.id);
            
            const embed = new EmbedBuilder()
                .setColor(success ? '#00FF00' : '#FF0000')
                .setTitle(success ? 'Log Channel Set' : 'Error Setting Log Channel')
                .setDescription(success 
                    ? `Log channel has been set to ${channel}`
                    : 'Failed to set the log channel. Please try again.'
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            if (success) {
                await db.logModerationAction(
                    message.author.id,
                    message.guild.id,
                    'SYSTEM',
                    'LOG_CHANNEL_SET',
                    `Set log channel to ${channel.name}`
                );
            }
        } catch (error) {
            console.error('Error in setlog command:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Database Error')
                .setDescription('An error occurred while setting the log channel. Please try again later.')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        }
    }
}; 