const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Make the bot say something in a voice channel')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text you want the bot to say')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('voice')
                .setDescription('Select the voice: "default" or "female"')
                .setRequired(false)
                .addChoices(
                    { name: 'Default', value: 'default' },
                    { name: 'Female', value: 'female' }
                )),

    async execute(interaction) {
        const client = interaction.client;
        const text = interaction.options.getString('text');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to join a voice channel first!', ephemeral: true });
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            let player = client.moonlink.players.get(interaction.guild.id);

            if (!player) {
                player = client.moonlink.createPlayer({
                    guildId: interaction.guild.id,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: interaction.channel.id,
                    autoLeave: true
                });
            }

            if (!player.connected) await player.connect();

            await player.speak({
                text: text,
                provider: 'google', // Generic provider
            });

            await interaction.editReply({ content: `Speaking: "${text}"` });
        } catch (error) {
            console.error('TTS error:', error);
            await interaction.editReply({ content: `Failed to speak: ${error.message}` });
        }
    }
};
