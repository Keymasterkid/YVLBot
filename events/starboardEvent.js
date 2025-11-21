const { EmbedBuilder } = require('discord.js');

const testmode = false; // Set to true for testing, false for normal operation

module.exports = (client, db) => {
  console.log('[STARBOARD] Starboard event handler initialized');
  
  // Check if database is properly passed
  if (!db) {
    console.error('[STARBOARD] Database object is null or undefined');
    return;
  }
  
  client.on('messageReactionAdd', async (reaction, user) => {
    console.log('[STARBOARD] Reaction added event triggered');

    try {
      if (reaction.partial) {
        await reaction.fetch();
        console.log('[STARBOARD] Partial reaction fetched successfully');
      }

      if (!reaction.emoji || reaction.emoji.name !== '⭐') {
        console.log('[STARBOARD] Not a ⭐ reaction, ignoring');
        return;
      }

      const { message } = reaction;
      const guild = message.guild;

      if (user.bot) {
        console.log('[STARBOARD] Reaction from bot, ignoring');
        return;
      }

      if (!message || !message.author) {
        console.log('[STARBOARD] Message or author not found');
        return;
      }

      console.log(`[STARBOARD] Processing reaction in guild: ${guild.name}, message by: ${message.author.tag}`);

      if (testmode) {
        await handleTestStarboard(reaction, guild, client, db);
      } else {
        await handleStarboard(reaction, user, guild, client, db, message);
      }
    } catch (error) {
      console.error('[STARBOARD] Error with Starboard system:', error);
    }
  });

  client.on('ready', async () => {
    console.log(`[STARBOARD] Searching for existing star reactions in all guilds`);
    const guilds = client.guilds.cache;

    for (const guild of guilds.values()) {
      console.log(`[STARBOARD] Checking guild: ${guild.name}`);
      const channels = guild.channels.cache.filter(channel => channel.isTextBased());

      for (const channel of channels.values()) {
        try {
          console.log(`[STARBOARD] Checking channel: ${channel.name} in ${guild.name}`);
          const messages = await channel.messages.fetch({ limit: 100 });
          console.log(`[STARBOARD] Fetched ${messages.size} messages from ${channel.name}`);
          
          for (const message of messages.values()) {
            const starReaction = message.reactions.cache.get('⭐');
            if (starReaction && starReaction.count >= 3) {
              console.log(`[STARBOARD] Processing existing starboard message in ${guild.name}: ${message.id}`);
              await handleStarboardExisting(message, starReaction, guild, client, db);
            }
          }
        } catch (error) {
          console.error(`[STARBOARD] Error fetching messages from channel ${channel.name} in guild ${guild.name}:`, error);
        }
      }
    }
  });
};

async function handleStarboard(reaction, user, guild, client, db, message) {
  if (user.bot) return;

  try {
    console.log(`[STARBOARD] Fetching starboard channel for guild ${guild.id}`);
    
    // Using Promise-based db.get
    const query = "SELECT starboard_channel FROM servers WHERE server_id = ?";
    const serverData = await db.get(query, [guild.id]);

    console.log(`[STARBOARD] Server data retrieved for ${guild.id}:`, serverData);

    if (!serverData || !serverData.starboard_channel) {
      console.log('[STARBOARD] No starboard channel set for this server');
      return;
    }

    const starboardChannelId = serverData.starboard_channel;
    console.log(`[STARBOARD] Starboard channel ID: ${starboardChannelId}`);
    
    const starboardChannel = await guild.channels.fetch(starboardChannelId).catch(err => {
      console.error(`[STARBOARD] Failed to fetch starboard channel: ${err.message}`);
      return null;
    });

    if (!starboardChannel || !starboardChannel.isTextBased()) {
      console.log('[STARBOARD] Starboard channel not found or is not a text-based channel');
      return;
    }

    // Updated permission check for Discord.js v14
    if (!starboardChannel.permissionsFor(client.user).has('SendMessages')) {
      console.log('[STARBOARD] No permission to send messages in the starboard channel');
      return;
    }

    const reactionCountThreshold = 3;
    if (reaction.count < reactionCountThreshold) {
      console.log(`[STARBOARD] Reaction count is below threshold: ${reaction.count}/${reactionCountThreshold}`);
      return;
    }

    const existingStarboardMessage = await starboardChannel.messages.fetch({ limit: 100 })
      .then(messages => messages.find(msg => 
        msg.embeds.length > 0 && 
        msg.embeds[0].footer && 
        msg.embeds[0].footer.text && 
        msg.embeds[0].footer.text.includes(message.id)
      ));

    if (existingStarboardMessage) {
      console.log('[STARBOARD] Message already exists on Starboard');
      return;
    }

    console.log('[STARBOARD] Creating Starboard embed...');
    await sendStarboardEmbed(message, reaction, starboardChannel);
  } catch (error) {
    console.error('[STARBOARD] An error occurred while handling the starboard event:', error);
  }
}

async function handleStarboardExisting(message, reaction, guild, client, db) {
  try {
    console.log(`[STARBOARD] Handling existing starred message in ${guild.name}, ID: ${message.id}`);
    
    // Using Promise-based db.get
    const query = "SELECT starboard_channel FROM servers WHERE server_id = ?";
    const row = await db.get(query, [guild.id]);
    
    console.log(`[STARBOARD] Retrieved server data for existing message:`, row);

    if (!row || !row.starboard_channel) {
      console.log('[STARBOARD] No starboard channel set for this server');
      return;
    }

    const starboardChannelId = row.starboard_channel;
    console.log(`[STARBOARD] Existing message - starboard channel ID: ${starboardChannelId}`);
    
    const starboardChannel = await guild.channels.fetch(starboardChannelId).catch(err => {
      console.error(`[STARBOARD] Failed to fetch starboard channel: ${err.message}`);
      return null;
    });

    if (!starboardChannel || !starboardChannel.isTextBased()) {
      console.log('[STARBOARD] Starboard channel not found in cache or not a text-based channel');
      return;
    }

    // Updated permission check for Discord.js v14
    if (!starboardChannel.permissionsFor(client.user).has('SendMessages')) {
      console.log('[STARBOARD] No permission to send messages in the starboard channel');
      return;
    }

    console.log('[STARBOARD] Creating Starboard embed for existing reaction...');
    await sendStarboardEmbed(message, reaction, starboardChannel);
  } catch (error) {
    console.error('[STARBOARD] Error handling existing starred message:', error);
  }
}

async function handleTestStarboard(reaction, guild, client, db) {
  console.log('[STARBOARD] Test mode activated: Starboard functionality triggered with reaction:', reaction.emoji.name);
  // Add test mode functionality here if needed
}

async function sendStarboardEmbed(message, reaction, starboardChannel) {
  try {
    console.log(`[STARBOARD] Creating embed for message ID: ${message.id}`);
    
    const starEmbed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content.length > 2000 ? `${message.content.slice(0, 2000)}...` : message.content || '[No text content]')
      .setColor('#FFD700')
      .setFooter({ text: `⭐ ${reaction.count} stars | Message ID: ${message.id}` })
      .setTimestamp(message.createdAt);

    if (message.attachments.size > 0) {
      starEmbed.setImage(message.attachments.first().url);
      console.log('[STARBOARD] Attachment found and added to embed');
    }

    // Add a link to the original message if possible
    if (message.url) {
      starEmbed.addFields({ name: 'Original Message', value: `[Jump to message](${message.url})` });
    }

    const sentMessage = await starboardChannel.send({ embeds: [starEmbed] });
    console.log('[STARBOARD] Starboard embed sent successfully');
    
    // React to the original message to show it was added to starboard
    await message.react('🌟').catch(err => {
      console.log('[STARBOARD] Could not add confirmation reaction:', err.message);
    });
    
    return sentMessage;
  } catch (error) {
    console.error('[STARBOARD] Error sending starboard embed:', error);
  }
}
