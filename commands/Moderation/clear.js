module.exports = {
    name: 'clear',
    description: 'Clears a specified number of messages in the channel.',
    async execute(message, args) {
        // Check if the user has permission to manage messages
        if (!message.member.permissions.has('MANAGE_MESSAGES')) {
            return message.reply("You don't have permission to use this command.");
        }

        // Check if an argument (number of messages to delete) was provided
        const amount = parseInt(args[0]);

        if (isNaN(amount) || amount <= 0 || amount > 100) {
            return message.reply("Please provide a number between 1 and 100.");
        }

        // Delete messages
        try {
            await message.channel.bulkDelete(amount, true);
            message.channel.send(`🧹 Cleared ${amount} messages.`).then(msg => {
                setTimeout(() => msg.delete(), 3000); // Delete confirmation message after 3 seconds
            });
        } catch (error) {
            console.error(error);
            message.reply("⚠️ There was an error trying to clear messages in this channel.");
        }
    }
};
