const { exec } = require('child_process');
const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');

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
        const text = interaction.options.getString('text');
        const voice = interaction.options.getString('voice') || 'default'; // Default to 'default' if no option is selected
        const voiceChannel = interaction.member.voice.channel;

        // Check if the user is in a voice channel
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to join a voice channel first!', ephemeral: true });
        }

        // Determine voice for TTS
        const voiceOption = voice === 'female' ? '-voice slt' : ''; // Use 'slt' for female voice (if supported by flite)

        // Generate speech with Flite
        const fliteCmd = `flite ${voiceOption} -t "${text}" output.wav`; // Generate WAV file from text
        exec(fliteCmd, (err, stdout, stderr) => {
            if (err) {
                console.error('Error generating TTS:', err);
                return interaction.reply({ content: 'Failed to generate speech.', ephemeral: true });
            }

            // Check if the bot is in the same voice channel as the user
            const botVoiceChannel = interaction.guild.me ? interaction.guild.me.voice.channel : null;
            if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
                return interaction.reply({ content: 'The bot is in a different voice channel. Please join the same one!', ephemeral: true });
            }

            // Join the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            // Create audio resource from the generated WAV file
            const audioResource = createAudioResource('output.wav');

            // Create an audio player
            const audioPlayer = createAudioPlayer();

            // Subscribe to the connection and play the audio
            connection.subscribe(audioPlayer);
            audioPlayer.play(audioResource);

            // Wait for the audio to finish
            audioPlayer.on(AudioPlayerStatus.Idle, () => {
                // Do nothing here, allowing the bot to stay in the channel
            });

            interaction.reply({ content: 'Speaking now...', ephemeral: true });
        });
    }
};
