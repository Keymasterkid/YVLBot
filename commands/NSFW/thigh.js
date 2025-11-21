const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    name: 'thigh',
    description: 'Sends a random NSFW GIF of thighs',
    async execute(message, args, client, prefix, db) {
        try {
            // Check if the user is blacklisted
            const userId = message.author.id;
            const user = await db.get('SELECT is_blacklisted FROM users WHERE id = ?', [userId]);

            if (user && user.is_blacklisted === 1) {
                return message.reply('You are blacklisted from using this command.');
            }

            // Check if the channel is NSFW
            if (!message.channel.nsfw) {
                return message.reply('This command can only be used in NSFW channels.');
            }

            const apiUrl = 'https://nekobot.xyz/api/image?type=thigh'; // Nekobot API for random NSFW thigh GIF.

            // Fetch the NSFW GIF
            const response = await axios.get(apiUrl);
            const imageUrl = response.data.message;

            if (imageUrl) {
                const embed = new EmbedBuilder()
                    .setTitle('Here\'s a random NSFW GIF of thighs')
                    .setImage(imageUrl)
                    .setColor('#FF69B4');

                message.channel.send({ embeds: [embed] });
            } else {
                message.channel.send('No GIF found at the moment.');
            }
        } catch (error) {
            console.error('Error fetching image:', error);
            message.channel.send('An error occurred while fetching the image.');
        }
    },
};
