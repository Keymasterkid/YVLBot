const { EmbedBuilder } = require('discord.js');

const responses = [
    'It is certain.',
    'It is decidedly so.',
    'Without a doubt.',
    'Yes - definitely.',
    'You may rely on it.',
    'As I see it, yes.',
    'Most likely.',
    'Outlook good.',
    'Yes.',
    'Signs point to yes.',
    'Reply hazy, try again.',
    'Ask again later.',
    'Better not tell you now.',
    'Cannot predict now.',
    'Concentrate and ask again.',
    'Don\'t count on it.',
    'My reply is no.',
    'My sources say no.',
    'Outlook not so good.',
    'Very doubtful.'
];

module.exports = {
    name: '8ball',
    description: 'Ask the magic 8ball a question',
    usage: '<question>',
    cooldown: 5,
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please ask a question!');
        }

        const question = args.join(' ');
        const response = responses[Math.floor(Math.random() * responses.length)];

        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('🎱 Magic 8-Ball')
            .addFields(
                { name: 'Question', value: question },
                { name: 'Answer', value: response }
            )
            .setFooter({ text: `Asked by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
}; 