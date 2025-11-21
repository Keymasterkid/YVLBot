const { ActivityType } = require('discord.js');

// Auto status updater state
const AUTO_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let autoUpdateInterval = null;
let boundListeners = false;

function formatActivityTypeLabel(activityType) {
  switch (activityType) {
    case ActivityType.Playing: return 'Playing';
    case ActivityType.Watching: return 'Watching';
    case ActivityType.Listening: return 'Listening to';
    case ActivityType.Streaming: return 'Streaming';
    case ActivityType.Competing: return 'Competing in';
    default: return 'Activity';
  }
}

async function updateDynamicStatus(client) {
  if (!client?.user) return;
  const totalServers = client.guilds.cache.size;
  const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
  await client.user.setPresence({
    status: 'dnd',
    activities: [{
      name: `${totalUsers} users in ${totalServers} servers`,
      type: ActivityType.Watching
    }]
  });
}

function startAutoStatus(client) {
  // Bind listeners once for immediate updates on join/leave
  if (!boundListeners) {
    boundListeners = true;
    client.on('guildCreate', () => updateDynamicStatus(client));
    client.on('guildDelete', () => updateDynamicStatus(client));
  }

  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
  }

  // Immediate update
  updateDynamicStatus(client).catch(console.error);
  // Periodic updates
  autoUpdateInterval = setInterval(() => {
    updateDynamicStatus(client).catch(console.error);
  }, AUTO_UPDATE_INTERVAL_MS);
}

function stopAutoStatus() {
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
  }
}

module.exports = {
  name: 'change_status',
  aliases: ['custom_status', 'status'],
  description: 'Change the bot\'s status and activity',
  async execute(message, args, client, prefix, db) {
    // Check if the user has the required permissions
    const userId = message.author.id;

    try {
      const userData = await db.get('SELECT is_admin FROM users WHERE id = ?', [userId]);

      if (!userData || !userData.is_admin) {
        return message.reply('Only bot admins are allowed to use this command.');
      }

      // If no arguments are provided, show help
      if (!args.length) {
        const helpEmbed = {
          color: 0x0099ff,
          title: '🔄 Bot Status Command Help',
          description: 'Change the bot\'s status and activity',
          fields: [
            {
              name: 'Status Types',
              value: '`-online` - Set status to online\n' +
                     '`-idle` - Set status to idle\n' +
                     '`-dnd` - Set status to Do Not Disturb\n' +
                     '`-invisible` - Set status to invisible'
            },
            {
              name: 'Activity Types',
              value: '`-playing <text>` - Set playing status\n' +
                     '`-watching <text>` - Set watching status\n' +
                     '`-listening <text>` - Set listening status\n' +
                     '`-streaming <url> <text>` - Set streaming status\n' +
                     '`-competing <text>` - Set competing status'
            },
            {
              name: 'Auto & Clear',
              value: '`-auto` - Resume automatic dynamic status updates\n' +
                     '`-clear` - Remove activity (keeps status)'
            },
            {
              name: 'Examples',
              value: '`-online -playing with code`\n' +
                     '`-dnd -watching over the server`\n' +
                     '`-streaming https://twitch.tv/example Playing Games`\n' +
                     '`-auto` to resume dynamic status'
            }
          ],
          footer: { text: 'You can combine status and activity types' }
        };
        return message.reply({ embeds: [helpEmbed] });
      }

      let status = 'online';
      let activity = null;
      let activityType = ActivityType.Playing;
      let streamingUrl = null;

      // Handle auto first
      const autoIndex = args.findIndex(arg => arg.toLowerCase() === '-auto');
      if (autoIndex !== -1) {
        startAutoStatus(client);
        return message.reply('✅ Resumed automatic dynamic status updates.');
      }

      // Check if user wants to clear current activity
      const clearIndex = args.findIndex(arg => arg.toLowerCase() === '-clear');
      const shouldClear = clearIndex !== -1;
      if (shouldClear) {
        args.splice(clearIndex, 1);
      }

      // Parse status
      const statusIndex = args.findIndex(arg => ['-online', '-idle', '-dnd', '-invisible'].includes(arg.toLowerCase()));
      if (statusIndex !== -1) {
        status = args[statusIndex].substring(1); // Remove the dash
        args.splice(statusIndex, 1);
      }

      // Parse activity (skip if clearing)
      if (!shouldClear) {
        const activityIndex = args.findIndex(arg => ['-playing', '-watching', '-listening', '-streaming', '-competing'].includes(arg.toLowerCase()));
        if (activityIndex !== -1) {
          const activityArg = args[activityIndex].substring(1); // Remove the dash
          const activityText = args.slice(activityIndex + 1).join(' ');

          switch (activityArg) {
            case 'playing':
              activityType = ActivityType.Playing;
              break;
            case 'watching':
              activityType = ActivityType.Watching;
              break;
            case 'listening':
              activityType = ActivityType.Listening;
              break;
            case 'streaming':
              activityType = ActivityType.Streaming;
              // Extract URL from the text
              const urlMatch = activityText.match(/(https?:\/\/[^\s]+)/);
              if (urlMatch) {
                streamingUrl = urlMatch[0];
                activity = activityText.replace(urlMatch[0], '').trim();
              } else {
                activity = activityText;
              }
              break;
            case 'competing':
              activityType = ActivityType.Competing;
              break;
          }

          if (!activity && activityArg !== 'streaming') {
            activity = activityText;
          }
        }
      }

      // Set the presence
      const presence = {
        status: status,
        activities: (activity && !shouldClear) ? [{
          name: activity,
          type: activityType,
          ...(streamingUrl && { url: streamingUrl })
        }] : []
      };

      await client.user.setPresence(presence);

      // If a custom status is set or clearing, pause auto updates so it doesn't get overridden
      stopAutoStatus();

      // Create confirmation embed
      const embed = {
        color: 0x00ff00,
        title: '✅ Bot Status Updated',
        fields: [
          { name: 'Status', value: status.charAt(0).toUpperCase() + status.slice(1), inline: true },
          ...((activity && !shouldClear) ? [{ name: 'Activity', value: `${formatActivityTypeLabel(activityType)} ${activity}`, inline: true }] : [{ name: 'Activity', value: 'None', inline: true }]),
          ...(streamingUrl ? [{ name: 'Stream URL', value: streamingUrl, inline: true }] : [])
        ],
        timestamp: new Date()
      };

      message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error changing bot status:', error);
      message.reply('There was an error changing the bot status. Please try again later.');
    }
  },

  // Start automatic, periodically refreshed status
  startAutoStatus,
  // Stop automatic updates (used when custom status is set)
  stopAutoStatus
};
