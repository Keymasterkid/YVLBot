const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'join',
    description: 'Makes the bot join your voice channel.',
    usage: '!join',
    async execute(message, args, client) {
        const { channel } = message.member.voice;

        if (!channel) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ You need to be in a voice channel first!')
                ]
            });
        }

        if (!channel.joinable) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ I don\'t have permission to join that voice channel!')
                ]
            });
        }

        try {
            let player = client.moonlink.players.get(message.guild.id);

            if (player && player.connected) {
                if (player.voiceChannelId === channel.id) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Yellow')
                                .setDescription('ℹ️ I\'m already in your voice channel!')
                        ]
                    });
                }
                // If in another channel, we could move or just warn. Let's move.
            }

            player = client.moonlink.createPlayer({
                guildId: message.guild.id,
                voiceChannelId: channel.id,
                textChannelId: message.channel.id,
                autoLeave: true
            });

            player.connect();

            message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Green')
                        .setDescription(`✅ Successfully joined **${channel.name}**!`)
                ]
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
