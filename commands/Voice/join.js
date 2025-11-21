const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'join',
    description: 'Makes the bot join your voice channel.',
    usage: '!join',
    async execute(message, args) {
        // Check if the user is in a voice channel
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ You need to be in a voice channel first!')
                ]
            });
        }

        // Check if the bot has permission to join the voice channel
        if (!voiceChannel.joinable) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ I don\'t have permission to join that voice channel!')
                ]
            });
        }

        // Check if the bot is already in a voice channel
        const botVoiceChannel = message.guild.members.me.voice.channel;
        if (botVoiceChannel) {
            if (botVoiceChannel.id === voiceChannel.id) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Yellow')
                            .setDescription('ℹ️ I\'m already in your voice channel!')
                    ]
                });
            }
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ I\'m already in another voice channel!')
                ]
            });
        }

        try {
            // Join the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            // Handle connection events
            connection.on(VoiceConnectionStatus.Connecting, () => {
                message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Yellow')
                            .setDescription('🔄 Connecting to voice channel...')
                    ]
                });
            });

            connection.on(VoiceConnectionStatus.Ready, () => {
                message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Green')
                            .setDescription(`✅ Successfully joined ${voiceChannel.name}!`)
                    ]
                });
            });

            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        connection.rejoin(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Voice connection timeout')), 5000)
                        )
                    ]);
                } catch (error) {
                    connection.destroy();
                    message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription('❌ Disconnected from voice channel!')
                        ]
                    });
                }
            });

        } catch (error) {
            console.error('Error joining voice channel:', error);
            message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ There was an error joining the voice channel!')
                ]
            });
        }
    },
};
