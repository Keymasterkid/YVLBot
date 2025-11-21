const { EmbedBuilder } = require('discord.js');

// Test mode configuration
const testmode = false; // Set to true for testing, false for normal operation

module.exports = (client, db) => {
  console.log('[MEMBERJOIN] Member join event handler initialized');
  
  // Check if database is properly passed
  if (!db) {
    console.error('[MEMBERJOIN] Database object is null or undefined');
    return;
  }
  
  client.on('guildMemberAdd', async (member) => {
    console.log(`[MEMBERJOIN] New member joined: ${member.user.tag} (${member.id}) in server: ${member.guild.name}`);
    const { guild } = member;

    try {
      // If test mode is enabled, send test messages to all welcome channels
      if (testmode) {
        console.log(`[MEMBERJOIN] Test mode enabled, sending test welcome message in ${guild.name}`);
        await sendTestWelcomeMessage(guild, db);
      } else {
        // Regular welcome message logic
        console.log(`[MEMBERJOIN] Sending welcome message for ${member.user.tag} in ${guild.name}`);
        await sendWelcomeMessage(member, db);
      }
    } catch (error) {
      console.error(`[MEMBERJOIN] Error handling guildMemberAdd event for ${member.user.tag}:`, error);
    }
  });
};

async function sendWelcomeMessage(member, db) {
  const { guild } = member;

  try {
    console.log(`[MEMBERJOIN] Fetching welcome channel for ${guild.name} (${guild.id})`);
    
    // Fetch the welcome channel ID using Promise-based db.get
    const query = "SELECT welcome_channel FROM servers WHERE server_id = ?";
    const serverData = await db.get(query, [guild.id]);

    console.log(`[MEMBERJOIN] Server data retrieved:`, serverData);
    
    const welcomeChannelId = serverData?.welcome_channel; // Get channel ID from database
    if (!welcomeChannelId) {
      console.warn(`[MEMBERJOIN] No welcome channel configured for server ${guild.name}. Skipping welcome message.`);
      return; // Ignore if no welcome channel is set
    }

    // Get the welcome channel using the ID stored in the database
    const welcomeChannel = guild.channels.cache.get(welcomeChannelId);
    console.log(`[MEMBERJOIN] Welcome channel found:`, welcomeChannel ? welcomeChannel.name : 'null');

    // Check if the channel exists and is a text channel
    if (welcomeChannel && welcomeChannel.isTextBased()) {
      // Create a welcome embed
      const welcomeEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 Welcome to the Server! 🎉')
        .setDescription(`Hello ${member}, welcome to **${guild.name}**! We're glad to have you here!`)
        .addFields({ name: 'Member Count:', value: `${guild.memberCount}`, inline: true })
        .setTimestamp()
        .setFooter({ text: 'Enjoy your stay and make new friends!' });

      // Send the welcome embed to the welcome channel
      const sentMessage = await welcomeChannel.send({ embeds: [welcomeEmbed] });
      console.log(`[MEMBERJOIN] Sent welcome message to ${member.user.tag} in channel ${welcomeChannel.name} in server ${guild.name}`);
      return sentMessage;
    } else {
      console.warn(`[MEMBERJOIN] Welcome channel not found or is not a text channel in server ${guild.name}. Channel ID: ${welcomeChannelId}`);
    }
  } catch (error) {
    console.error(`[MEMBERJOIN] Error sending welcome message in server ${guild.name}:`, error);
  }
}

async function sendTestWelcomeMessage(guild, db) {
  try {
    console.log(`[MEMBERJOIN] Starting test welcome message for server ${guild.name}`);
    
    // Fetch the welcome channel ID using Promise-based db.get
    const query = "SELECT welcome_channel FROM servers WHERE server_id = ?";
    const serverData = await db.get(query, [guild.id]);
    
    console.log(`[MEMBERJOIN] Test mode - server data retrieved:`, serverData);
    
    const welcomeChannelId = serverData?.welcome_channel; // Get channel ID from database
    if (!welcomeChannelId) {
      console.warn(`[MEMBERJOIN] No welcome channel configured for server ${guild.name}. Skipping test message.`);
      return; // Ignore if no welcome channel is set
    }

    // Get the welcome channel using the ID stored in the database
    const welcomeChannel = guild.channels.cache.get(welcomeChannelId);
    console.log(`[MEMBERJOIN] Test mode - welcome channel found:`, welcomeChannel ? welcomeChannel.name : 'null');

    // Check if the channel exists and is a text channel
    if (welcomeChannel && welcomeChannel.isTextBased()) {
      // Create a standardized embed for the test welcome message
      const testWelcomeEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 Test Mode: Welcome to the Server! 🎉')
        .setDescription(`Hello, this is a test message for all welcome channels!`)
        .addFields({ name: 'Test Member Count:', value: 'This is a test message, not a real member count.', inline: true })
        .setTimestamp()
        .setFooter({ text: 'This message is part of the test mode!' });

      // Send the test welcome embed to the welcome channel
      const sentMessage = await welcomeChannel.send({ embeds: [testWelcomeEmbed] });
      console.log(`[MEMBERJOIN] Sent test welcome message to channel ${welcomeChannel.name} in server ${guild.name}`);
      return sentMessage;
    } else {
      console.warn(`[MEMBERJOIN] Test mode - welcome channel not found or is not a text channel in server ${guild.name}. Channel ID: ${welcomeChannelId}`);
    }
  } catch (error) {
    console.error(`[MEMBERJOIN] Error sending test welcome message in server ${guild.name}:`, error);
  }
}
