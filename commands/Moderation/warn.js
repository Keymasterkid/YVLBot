const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    name: 'warn',
    description: 'Warn a user for breaking rules',
    usage: '<@user> <reason>',
    permissions: [PermissionsBitField.Flags.ModerateMembers],
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please mention a user and provide a reason!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('Please mention a valid user!');
        }

        if (user.id === message.author.id) {
            return message.reply('You cannot warn yourself!');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        // Add warning to database
        await db.run(`
            INSERT INTO warnings (user_id, server_id, moderator_id, reason, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `, [user.id, message.guild.id, message.author.id, reason, Date.now()]);

        // Get warning count
        const warningCount = await db.get(`
            SELECT COUNT(*) as count 
            FROM warnings 
            WHERE user_id = ? AND server_id = ?
        `, [user.id, message.guild.id]);

        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('⚠ Warning Issued')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
                { name: 'Reason', value: reason },
                { name: 'Total Warnings', value: warningCount.count.toString() }
            )
            .setFooter({ text: `Warned by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

        // Try to DM the user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('⚠ You have been warned')
                .addFields(
                    { name: 'Server', value: message.guild.name },
                    { name: 'Reason', value: reason },
                    { name: 'Total Warnings', value: warningCount.count.toString() }
                )
                .setFooter({ text: `Warned by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.error(`Could not send DM to ${user.tag}:`, error);
        }
    }
}; 