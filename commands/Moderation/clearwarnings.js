const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    name: 'clearwarnings',
    description: 'Clear all warnings for a user',
    usage: '<@user>',
    permissions: [PermissionsBitField.Flags.ModerateMembers],
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please mention a user to clear their warnings!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('Please mention a valid user!');
        }

        const warnings = await db.getWarnings(user.id, message.guild.id);
        if (warnings.length === 0) {
            return message.reply('This user has no warnings to clear!');
        }

        await db.clearWarnings(user.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Warnings Cleared')
            .setDescription(`All warnings have been cleared for ${user.tag}`)
            .addFields(
                { name: 'Cleared By', value: message.author.tag },
                { name: 'Total Warnings Cleared', value: warnings.length.toString() }
            )
            .setFooter({ text: `Cleared by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
}; 