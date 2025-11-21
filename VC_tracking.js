const { Client } = require('discord.js');

// Voice channel tracking module
module.exports = (client, db) => {
  // Track by both userId and serverId
  const userVCData = new Map();
  const saveInterval = 300000; // Save data every 5 minutes (300000ms)

  console.log('Voice channel tracking initialized. Checking for active voice channels...');

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
          console.log(`User <@${userId}> is already in a voice channel in server <@${serverId}>`);

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
    console.log(`[VC Tracking Debug] Starting periodic save. Currently tracking ${userVCData.size} users:`);
    userVCData.forEach((data, key) => {
      console.log(`- User <@${data.userId}> in server <@${data.serverId}> (key: ${key})`);
    });

    // Create an array of all entries to process
    const entriesToProcess = Array.from(userVCData.entries());
    let processedCount = 0;
    let errorCount = 0;
    
    console.log(`[VC Tracking Debug] Will process ${entriesToProcess.length} users`);
    
    // Process all users in parallel
    const processPromises = entriesToProcess.map(async ([userServerKey, data]) => {
      try {
        const duration = Math.floor((Date.now() - data.start) / 1000); // Duration in seconds
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);

        console.log(`[VC Tracking Debug] Processing periodic save for:`);
        console.log(`- User <@${data.userId}> in server <@${data.serverId}>`);
        console.log(`- Duration: ${duration} seconds (${hours}h ${minutes}m)`);
        console.log(`- Tracking key: ${userServerKey}`);

        // Update activity in the database
        await updateVCActivity(db, data.userId, data.serverId, hours, minutes);
        
        // Reset start time after saving but keep tracking
        userVCData.set(userServerKey, { 
          start: Date.now(), 
          userId: data.userId, 
          serverId: data.serverId 
        });
        
        console.log(`[VC Tracking Debug] Successfully saved and reset tracking for user <@${data.userId}>`);
        processedCount++;
        return true;
      } catch (error) {
        console.error(`[VC Tracking Debug] Error updating VC data for user <@${data.userId}> in server <@${data.serverId}>:`, error);
        errorCount++;
        return false;
      }
    });

    // Wait for all processing to complete
    await Promise.all(processPromises);

    console.log(`[VC Tracking Debug] Periodic save completed:`);
    console.log(`- Total users processed: ${processedCount}`);
    console.log(`- Errors encountered: ${errorCount}`);
    console.log(`- Remaining tracked users: ${userVCData.size}`);
  }, saveInterval);

  client.on('voiceStateUpdate', async (oldState, newState) => {
    // Skip if user is a bot
    if (newState.member?.user.bot || oldState.member?.user.bot) return;
    
    const userId = newState.member?.id || oldState.member?.id;
    const serverId = newState.guild?.id || oldState.guild?.id;
    const userServerKey = `${userId}-${serverId}`;

    console.log(`[VC Tracking Debug] Voice state update:`);
    console.log(`- User <@${userId}> in server <@${serverId}>`);
    console.log(`- Key: ${userServerKey}`);
    console.log(`- Currently tracking ${userVCData.size} users`);

    // User joins a voice channel
    if (newState.channel && !oldState.channel) {
      console.log(`[VC Tracking Debug] User joined VC:`);
      console.log(`- Channel: ${newState.channel.name}`);
      console.log(`- Current tracked users: ${userVCData.size}`);

      // Start tracking VC time
      if (!userVCData.has(userServerKey)) {
        userVCData.set(userServerKey, { start: Date.now(), userId, serverId });
        console.log(`[VC Tracking Debug] Started tracking new user`);
      } else {
        console.log(`[VC Tracking Debug] User already being tracked`);
      }
    }

    // User leaves a voice channel
    else if (oldState.channel && !newState.channel) {
      const data = userVCData.get(userServerKey);
      if (data) {
        const duration = Math.floor((Date.now() - data.start) / 1000); // Duration in seconds
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);

        console.log(`User <@${userId}> left the voice channel in server <@${serverId}> after ${hours} hours and ${minutes} minutes`);

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
      console.log(`User <@${userId}> switched voice channels in server <@${serverId}>`);
      // When switching, first credit elapsed time so far, then reset start
      const data = userVCData.get(userServerKey);
      if (data) {
        const duration = Math.floor((Date.now() - data.start) / 1000); // seconds
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        try {
          await updateVCActivity(db, userId, serverId, hours, minutes);
        } catch (error) {
          console.error(`[VC Tracking Debug] Error updating on channel switch for <@${userId}> in <@${serverId}>:`, error);
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

  console.log(`[VC Tracking Debug] Before update for user <@${userId}> in server <@${serverId}>:`);
  console.log(`- Input hours: ${hours}`);
  console.log(`- Input minutes: ${minutes}`);
  console.log(`- Calculated extra hours from minutes: ${extraHours}`);
  console.log(`- Final total hours to add: ${totalHours}`);
  console.log(`- Final remaining minutes: ${remainingMinutes}`);

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

