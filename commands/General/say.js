const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'say',
  description: 'Makes the bot repeat your message.',
  execute: async (message, args, client, prefix, db) => {
    // Check if the user has permission to use the command
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("You don't have permission to use this command.");
    }

    // Join the arguments to form the message
    const messageContent = args.join(' ');
    
    // Check if there is any message to say
    if (!messageContent) {
      return message.reply('You need to provide a message for me to say!');
    }

    // Input validation: block potentially harmful content
    const disallowedPatterns = [
      /@(everyone|here)/gi,  // Prevent pinging @everyone and @here
      /```/g,               // Block code blocks
      /<https?:\/\/[^\s>]+>/g, // Block URLs
      /(?:\b(https?|ftp):\/\/[^\s/$.?#].[^\s]*\b)/gi, // Block URLs in text
      /`/g,                 // Block inline code
    ];

    // Check if the message content matches any disallowed patterns
    if (disallowedPatterns.some(pattern => pattern.test(messageContent))) {
      return message.reply("Your message contains forbidden content (mentions, links, or code).");
    }

    // Check for excessively long messages (optional)
    if (messageContent.length > 2000) {
      return message.reply("Your message is too long! It must be under 2000 characters.");
    }

    // Delete the command message for cleanliness
    await message.delete().catch(err => {
      console.error('Failed to delete message:', err);
    });

    // Send the message to the same channel
    await message.channel.send(messageContent);
  }
};
