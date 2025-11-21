const { Client } = require('discord.js');

// Voice channel tracking module
module.exports = (client, db) => {
  // Track by both userId and serverId
  const userVCData = new Map();
  const SAVE_INTERVAL = 300000; // Save data every 5 minutes (300000ms)

  console.log('Voice channel tracking initialized.');

  // Check all active voice channels on bot startup
  client.guilds.cache.forEach((guild) => {
    guild.channels.cache
      .filter((channel) => channel.isVoiceBased()) // Check if it's a voice-based channel
      .forEach((voiceChannel) => {
        voiceChannel.members.forEach((member) => {
          // Skip if member is a bot
          if (member.user.bot) return;

          const userId = member.id;
          const serverId = guild.id;

          // Start tracking VC time for those already in voice channels
          const userServerKey = `${userId}-${serverId}`;
          if (!userVCData.has(userServerKey)) {
            userVCData.set(userServerKey, { start: Date.now(), userId, serverId });
          }
        });
      });
  });

  // Periodic save function for users still in VC
  setInterval(async () => {
    if (userVCData.size === 0) return;

    // Create an array of all entries to process
    const entriesToProcess = Array.from(userVCData.entries());
    let processedCount = 0;
    let errorCount = 0;

    // Process all users in parallel
    const processPromises = entriesToProcess.map(async ([userServerKey, data]) => {
      try {
        const duration = Math.floor((Date.now() - data.start) / 1000); // Duration in seconds

        // Only update if at least 1 minute has passed
        if (duration < 60) return true;

        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);

        // Update activity in the database
        await updateVCActivity(db, data.userId, data.serverId, hours, minutes);

        // Reset start time after saving but keep tracking
        userVCData.set(userServerKey, {
          start: Date.now(),
          userId: data.userId,
          serverId: data.serverId
        });

        processedCount++;
        return true;
      } catch (error) {
        console.error(`[VC Tracking] Error updating VC data for user <@${data.userId}> in server <@${data.serverId}>:`, error);
        errorCount++;
        return false;
      }
    });

    // Wait for all processing to complete
    await Promise.all(processPromises);

    if (errorCount > 0) {
      console.warn(`[VC Tracking] Periodic save completed with ${errorCount} errors. Processed: ${processedCount}`);
    }
  }, SAVE_INTERVAL);

  client.on('voiceStateUpdate', async (oldState, newState) => {
    // Skip if user is a bot
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

    const userId = newState.member?.id || oldState.member?.id;
    const serverId = newState.guild?.id || oldState.guild?.id;
    const userServerKey = `${userId}-${serverId}`;

    // User joins a voice channel
    if (newState.channel && !oldState.channel) {
      // Start tracking VC time
      if (!userVCData.has(userServerKey)) {
        userVCData.set(userServerKey, { start: Date.now(), userId, serverId });
      }
    }

    // User leaves a voice channel
    else if (oldState.channel && !newState.channel) {
      const data = userVCData.get(userServerKey);
      if (data) {
        const duration = Math.floor((Date.now() - data.start) / 1000); // Duration in seconds
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);

        try {
          // Update VC activity in the database
          await updateVCActivity(db, userId, serverId, hours, minutes);
        } catch (error) {
          console.error(`Error updating VC data for user <@${userId}> in server <@${serverId}>: ${error.message}`);
        }

        userVCData.delete(userServerKey); // Remove from tracking after logging
      }
    }

    // Handle switching between voice channels within the same server
    else if (oldState.channel && newState.channel) {
      // When switching, first credit elapsed time so far, then reset start
      const data = userVCData.get(userServerKey);
      if (data) {
        const duration = Math.floor((Date.now() - data.start) / 1000); // seconds
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        try {
          await updateVCActivity(db, userId, serverId, hours, minutes);
        } catch (error) {
          console.error(`[VC Tracking] Error updating on channel switch for <@${userId}> in <@${serverId}>:`, error);
        }
      }
      userVCData.set(userServerKey, { start: Date.now(), userId, serverId });
    }
  });
};

async function updateVCActivity(db, userId, serverId, hours, minutes) {
  // Convert excess minutes into hours before updating
  const extraHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const totalHours = hours + extraHours;

  const query = `
    INSERT INTO vc_activity (user_id, server_id, hours, minutes) 
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, server_id) 
    DO UPDATE SET 
      minutes = (minutes + ?) % 60,
      hours = hours + ? + CAST((minutes + ?) / 60 AS INTEGER)
  `;

  await db.run(query, [userId, serverId, totalHours, remainingMinutes, remainingMinutes, totalHours, remainingMinutes]);
}

