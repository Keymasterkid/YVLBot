module.exports = {
    name: 'fuck',
    description: 'Spice things up with a consenting user in an NSFW channel!',
    async execute(message, args) {
        // Check if the channel is NSFW
        if (!message.channel.nsfw) {
            return message.reply("This command can only be used in NSFW channels. 🔞");
        }

        // Check if a user was mentioned
        const target = message.mentions.users.first();
        if (!target) {
            return message.reply("Please mention a consenting user to use this command. 😉");
        }

        const author = message.author;

        // Array of GIF URLs for the embed
        const gifs = [
            'https://i.gifer.com/TkTY.gif',
            'https://i.gifer.com/1hys.gif',
            'https://i.gifer.com/OuD1.gif',
            'https://i.gifer.com/73CE.gif',
            'https://i.gifer.com/RQKW.gif',
            'https://i.gifer.com/TEb3.gif'
        ];

        // Select a random GIF from the array
        const selectedGif = gifs[Math.floor(Math.random() * gifs.length)];

        // Random fun descriptions for variety
        const descriptions = [
            `${author.username} and ${target.username} are having a moment too hot to handle! 🔥`,
            `Looks like ${author.username} and ${target.username} are getting steamy together! 🍑💦`,
            `${author.username} is showing ${target.username} some real affection. 😏`,
            `Things are heating up between ${author.username} and ${target.username}! 🔥❤️`,
            `${author.username} and ${target.username} are... well, let's give them some privacy! 😳`
        ];
        const description = descriptions[Math.floor(Math.random() * descriptions.length)];

        // Enhanced NSFW embed with a random GIF and description
        const nsfwEmbed = {
            color: 0xff6699,
            title: 'NSFW Interaction 🔥',
            description: description,
            image: {
                url: selectedGif
            },
            footer: {
                text: 'NSFW Content | Viewer discretion advised'
            },
            timestamp: new Date()
        };

        // Send the embed
        message.channel.send({ embeds: [nsfwEmbed] });
    }
};
