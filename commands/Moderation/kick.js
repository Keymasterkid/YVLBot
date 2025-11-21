const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    name: 'kick',
    description: 'Kick a user from the server',
    usage: '<@user> [reason]',
    permissions: [PermissionsBitField.Flags.KickMembers],
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please mention a user to kick!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('Please mention a valid user!');
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member) {
            return message.reply('That user is not in this server!');
        }

        if (!member.kickable) {
            return message.reply('I cannot kick this user! They may have a higher role than me.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        // Log the kick in database
        await db.run(`
            INSERT INTO moderation_logs (user_id, server_id, moderator_id, action, reason, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [user.id, message.guild.id, message.author.id, 'kick', reason, Date.now()]);

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('👢 User Kicked')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Reason', value: reason }
            )
            .setFooter({ text: `Kicked by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        // Try to DM the user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle('👢 You have been kicked')
                .addFields(
                    { name: 'Server', value: message.guild.name },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: `Kicked by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.error(`Could not send DM to ${user.tag}:`, error);
        }

        // Kick the user
        await member.kick(reason);
        await message.reply({ embeds: [embed] });
    }
}; 