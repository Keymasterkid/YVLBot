const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    name: 'warnings',
    description: 'View warnings for a user',
    usage: '<@user>',
    permissions: [PermissionsBitField.Flags.ModerateMembers],
    async execute(message, args) {
        const user = message.mentions.users.first() || message.author;
        const warnings = await db.getWarnings(user.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle(`⚠ Warnings for ${user.tag}`)
            .setThumbnail(user.displayAvatarURL());

        if (warnings.length === 0) {
            embed.setDescription('No warnings found.');
        } else {
            const warningList = warnings.map((warn, index) => {
                const date = new Date(warn.timestamp);
                return `**#${index + 1}** - ${warn.reason}\n` +
                    `Moderator: ${warn.moderator_name || 'Unknown'}\n` +
                    `Date: ${date.toLocaleString()}\n`;
            }).join('\n');

            embed.setDescription(warningList);
        }

        embed.setFooter({ 
            text: `Total Warnings: ${warnings.length}`,
            iconURL: message.author.displayAvatarURL()
        });

        await message.reply({ embeds: [embed] });
    }
}; 