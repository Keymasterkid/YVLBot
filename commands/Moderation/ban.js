const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    name: 'ban',
    description: 'Ban a user from the server',
    usage: '<@user> [reason]',
    permissions: [PermissionsBitField.Flags.BanMembers],
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please mention a user to ban!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('Please mention a valid user!');
        }

        const member = message.guild.members.cache.get(user.id);
        if (member && !member.bannable) {
            return message.reply('I cannot ban this user! They may have a higher role than me.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        // Log the ban in database
        await db.run(`
            INSERT INTO moderation_logs (user_id, server_id, moderator_id, action, reason, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [user.id, message.guild.id, message.author.id, 'ban', reason, Date.now()]);

        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('🔨 User Banned')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Reason', value: reason }
            )
            .setFooter({ text: `Banned by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        // Try to DM the user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('🔨 You have been banned')
                .addFields(
                    { name: 'Server', value: message.guild.name },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: `Banned by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.error(`Could not send DM to ${user.tag}:`, error);
        }

        // Ban the user
        await message.guild.members.ban(user, { reason });
        await message.reply({ embeds: [embed] });
    }
}; 