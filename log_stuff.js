const { Client, EmbedBuilder, AuditLogEvent } = require('discord.js');
const nukeProtection = require('./utils/nukeProtection');

// Configuration constants
const LOG_COOLDOWN = 30000; // 30 seconds cooldown
const AUDIT_LOG_DELAY = 3500; // Delay for audit logs to arrive
const AUDIT_MATCH_WINDOW_MS = 10000; // Max difference between event and audit entry
const LOG_CHANNEL_CACHE_TTL = 300000; // 5 minutes cache for log channels

// State management
const recentLogs = new Map();
const logChannelCache = new Map();

module.exports = async (client, db) => {

  async function getLogChannel(guild) {
    try {
      // Check cache first
      const cached = logChannelCache.get(guild.id);
      if (cached && Date.now() - cached.timestamp < LOG_CHANNEL_CACHE_TTL) {
        return cached.channel;
      }

      const channelId = await db.getLogChannel(guild.id);
      if (!channelId) {
        logChannelCache.set(guild.id, { channel: null, timestamp: Date.now() });
        return null;
      }

      let channel = guild.channels.cache.get(channelId);
      if (!channel) {
        try {
          channel = await guild.channels.fetch(channelId).catch(() => null);
        } catch (_) {
          channel = null;
        }
      }

      const validChannel = channel?.isTextBased() ? channel : null;
      logChannelCache.set(guild.id, { channel: validChannel, timestamp: Date.now() });

      return validChannel;
    } catch (error) {
      console.error(`[LogSystem] Error getting log channel for guild ${guild.id}:`, error);
      return null;
    }
  }

  async function logEmbed(guild, embed) {
    try {
      const logChannel = await getLogChannel(guild);
      if (!logChannel) return;

      // Check if this is a duplicate log
      const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed.data || {};
      const logKey = `${guild.id}-${data.title || ''}-${data.description || ''}`;
      const lastLog = recentLogs.get(logKey);
      const now = Date.now();

      if (lastLog && now - lastLog < LOG_COOLDOWN) {
        return; // Skip duplicate log
      }

      // Update the last log time
      recentLogs.set(logKey, now);

      // Clean up old log entries
      for (const [key, timestamp] of recentLogs.entries()) {
        if (now - timestamp > LOG_COOLDOWN) {
          recentLogs.delete(key);
        }
      }

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('[LogSystem] Error sending log embed:', error);
    }
  }

  function handleError(guild, error, event) {
    console.error(`[LogSystem] Error during ${event}:`, error);

    const embed = new EmbedBuilder()
      .setTitle('Error Occurred')
      .setDescription(`An error occurred during the \`${event}\` event.`)
      .addFields(
        { name: 'Error Message', value: `\`${error.message}\`` },
        { name: 'Stack Trace', value: `\`\`\`${error.stack?.slice(0, 1000) || 'No stack trace'}\`\`\`` }
      )
      .setColor('Red')
      .setTimestamp();

    logEmbed(guild, embed);
  }

  async function fetchAuditLogEntry(guild, auditType, targetId = null) {
    try {
      // Guard against missing permission to view audit logs
      const me = guild.members?.me;
      const hasPerm = me?.permissions?.has?.('ViewAuditLog');
      if (!hasPerm) return null;

      const auditLogs = await guild.fetchAuditLogs({
        type: auditType,
        limit: 10 // Increased limit for better accuracy
      });

      // If targetId is provided, find the entry for that target
      if (targetId) {
        return auditLogs.entries.find(entry => entry.target?.id === targetId);
      }

      return auditLogs.entries.first();
    } catch (error) {
      console.error(`[LogSystem] Failed to fetch audit logs for ${auditType}:`, error);
      return null;
    }
  }

  // Try to find the most appropriate audit log entry for an event
  async function findMatchingAuditEntry(guild, auditType, opts = {}) {
    const { targetId = null, channelId = null, eventTimeMs = Date.now() } = opts;
    try {
      const me = guild.members?.me;
      const hasPerm = me?.permissions?.has?.('ViewAuditLog');
      if (!hasPerm) return null;

      await new Promise(r => setTimeout(r, AUDIT_LOG_DELAY));
      const logs = await guild.fetchAuditLogs({ type: auditType, limit: 10 });
      const entries = Array.from(logs.entries.values());

      const candidates = entries.filter(entry => {
        if (targetId && entry.target?.id !== targetId) return false;
        if (channelId) {
          const extraChannelId = entry.extra?.channel?.id || entry.extra?.channelId || entry.extra?.id;
          if (extraChannelId && extraChannelId !== channelId) return false;
        }
        if (entry.createdTimestamp && Math.abs(entry.createdTimestamp - eventTimeMs) > AUDIT_MATCH_WINDOW_MS) return false;
        return true;
      });

      return candidates[0] || entries[0] || null;
    } catch (error) {
      console.error(`[LogSystem] Failed to find matching audit entry for ${auditType}:`, error);
      return null;
    }
  }

  // ========================== Role Events ==========================
  client.on('roleCreate', async (role) => {
    try {
      const logChannel = await getLogChannel(role.guild);
      if (!logChannel) return;

      const log = await findMatchingAuditEntry(role.guild, AuditLogEvent.RoleCreate, { targetId: role.id, eventTimeMs: role.createdTimestamp || Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      // Check for mass role creation
      const recentRoleCreations = await role.guild.fetchAuditLogs({
        type: AuditLogEvent.RoleCreate,
        limit: 5
      });

      if (recentRoleCreations.entries.size >= 3) {
        console.log('[LogSystem] Detected mass role creation, calling nuke protection');
        await nukeProtection.handleMassRoleCreation(role.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Role Created')
        .setDescription(`A new role was created by \`${executor.tag}\``)
        .addFields(
          { name: 'Role Name', value: `\`${role.name}\``, inline: true },
          { name: 'Role ID', value: `\`${role.id}\``, inline: true },
          { name: 'Color', value: `\`${role.hexColor}\``, inline: true },
          { name: 'Position', value: `\`${role.position}\``, inline: true },
          { name: 'Mentionable', value: `\`${role.mentionable}\``, inline: true },
          { name: 'Hoisted', value: `\`${role.hoist}\``, inline: true },
          { name: 'Permissions', value: `\`${role.permissions.toArray().join(', ')}\`` }
        )
        .setColor(role.color)
        .setTimestamp();

      logEmbed(role.guild, embed);
      await db.logModerationAction(executor.id, role.guild.id, 'SYSTEM', 'ROLE_CREATE', `Created role ${role.name}`);
    } catch (error) {
      handleError(role.guild, error, 'roleCreate');
    }
  });

  client.on('roleDelete', async (role) => {
    try {
      const logChannel = await getLogChannel(role.guild);
      if (!logChannel) return;

      const log = await findMatchingAuditEntry(role.guild, AuditLogEvent.RoleDelete, { targetId: role.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      // Check for mass role deletion
      const recentRoleDeletions = await role.guild.fetchAuditLogs({
        type: AuditLogEvent.RoleDelete,
        limit: 5
      });

      if (recentRoleDeletions.entries.size >= 3) {
        await nukeProtection.handleMassRoleDeletion(role.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Role Deleted')
        .setDescription(`The role \`${role.name}\` was deleted by \`${executor.tag}\``)
        .addFields(
          { name: 'Role Name', value: `\`${role.name}\``, inline: true },
          { name: 'Role ID', value: `\`${role.id}\``, inline: true },
          { name: 'Color', value: `\`${role.hexColor}\``, inline: true },
          { name: 'Position', value: `\`${role.position}\``, inline: true },
          { name: 'Permissions', value: `\`${role.permissions.toArray().join(', ')}\`` }
        )
        .setColor('Red')
        .setTimestamp();

      logEmbed(role.guild, embed);
      await db.logModerationAction(executor.id, role.guild.id, 'SYSTEM', 'ROLE_DELETE', `Deleted role ${role.name}`);
    } catch (error) {
      handleError(role.guild, error, 'roleDelete');
    }
  });

  client.on('roleUpdate', async (oldRole, newRole) => {
    try {
      const logChannel = await getLogChannel(newRole.guild);
      if (!logChannel) return;

      const log = await findMatchingAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, { targetId: newRole.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const changes = [];
      if (oldRole.name !== newRole.name) {
        changes.push({ name: 'Name', value: `\`${oldRole.name}\` → \`${newRole.name}\`` });
      }
      if (oldRole.color !== newRole.color) {
        changes.push({ name: 'Color', value: `\`${oldRole.hexColor}\` → \`${newRole.hexColor}\`` });
      }
      if (oldRole.hoist !== newRole.hoist) {
        changes.push({ name: 'Hoisted', value: `\`${oldRole.hoist}\` → \`${newRole.hoist}\`` });
      }
      if (oldRole.mentionable !== newRole.mentionable) {
        changes.push({ name: 'Mentionable', value: `\`${oldRole.mentionable}\` → \`${newRole.mentionable}\`` });
      }
      if (oldRole.permissions !== newRole.permissions) {
        const oldPerms = oldRole.permissions.toArray();
        const newPerms = newRole.permissions.toArray();
        const added = newPerms.filter(p => !oldPerms.includes(p));
        const removed = oldPerms.filter(p => !newPerms.includes(p));

        if (added.length > 0) {
          changes.push({ name: 'Added Permissions', value: `\`${added.join(', ')}\`` });
        }
        if (removed.length > 0) {
          changes.push({ name: 'Removed Permissions', value: `\`${removed.join(', ')}\`` });
        }
      }

      if (changes.length > 0) {
        const embed = new EmbedBuilder()
          .setTitle('Role Updated')
          .setDescription(`The role \`${oldRole.name}\` was updated by \`${executor.tag}\``)
          .addFields(changes)
          .setColor(newRole.color)
          .setTimestamp();

        logEmbed(newRole.guild, embed);
        await db.logModerationAction(executor.id, newRole.guild.id, 'SYSTEM', 'ROLE_UPDATE', `Updated role ${oldRole.name}`);
      }
    } catch (error) {
      handleError(newRole.guild, error, 'roleUpdate');
    }
  });

  // ========================== Emoji Events ==========================
  client.on('emojiCreate', async (emoji) => {
    try {
      const log = await findMatchingAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate, { targetId: emoji.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const embed = new EmbedBuilder()
        .setTitle('Emoji Created')
        .setDescription(`A new emoji \`${emoji.name}\` was created by \`${executor.tag}\`.`)
        .addFields(
          { name: 'Emoji Name', value: `\`${emoji.name}\``, inline: true },
          { name: 'Emoji ID', value: `\`${emoji.id}\``, inline: true },
          { name: 'Animated', value: `\`${emoji.animated}\``, inline: true },
          { name: 'URL', value: emoji.url }
        )
        .setColor('Green')
        .setTimestamp();

      logEmbed(emoji.guild, embed);
      await db.logModerationAction(executor.id, emoji.guild.id, 'SYSTEM', 'EMOJI_CREATE', `Created emoji ${emoji.name}`);
    } catch (error) {
      handleError(emoji.guild, error, 'emojiCreate');
    }
  });

  client.on('emojiDelete', async (emoji) => {
    try {
      const log = await findMatchingAuditEntry(emoji.guild, AuditLogEvent.EmojiDelete, { targetId: emoji.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const embed = new EmbedBuilder()
        .setTitle('Emoji Deleted')
        .setDescription(`The emoji \`${emoji.name}\` was deleted by \`${executor.tag}\`.`)
        .addFields(
          { name: 'Emoji Name', value: `\`${emoji.name}\``, inline: true },
          { name: 'Emoji ID', value: `\`${emoji.id}\``, inline: true },
          { name: 'Animated', value: `\`${emoji.animated}\``, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

      logEmbed(emoji.guild, embed);
      await db.logModerationAction(executor.id, emoji.guild.id, 'SYSTEM', 'EMOJI_DELETE', `Deleted emoji ${emoji.name}`);
    } catch (error) {
      handleError(emoji.guild, error, 'emojiDelete');
    }
  });

  client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
    try {
      const log = await findMatchingAuditEntry(newEmoji.guild, AuditLogEvent.EmojiUpdate, { targetId: newEmoji.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const changes = [];
      if (oldEmoji.name !== newEmoji.name) {
        changes.push({ name: 'Name', value: `\`${oldEmoji.name}\` → \`${newEmoji.name}\`` });
      }

      if (changes.length > 0) {
        const embed = new EmbedBuilder()
          .setTitle('Emoji Updated')
          .setDescription(`The emoji \`${oldEmoji.name}\` was updated by \`${executor.tag}\`.`)
          .addFields(changes)
          .setColor('Yellow')
          .setTimestamp();

        logEmbed(newEmoji.guild, embed);
        await db.logModerationAction(executor.id, newEmoji.guild.id, 'SYSTEM', 'EMOJI_UPDATE', `Updated emoji ${oldEmoji.name}`);
      }
    } catch (error) {
      handleError(newEmoji.guild, error, 'emojiUpdate');
    }
  });

  // ========================== Message Events ==========================
  client.on('messageDelete', async (message) => {
    if (message.partial) return;

    try {
      const logChannel = await getLogChannel(message.guild);
      if (!logChannel) return;

      // Skip logging if the message is in the log channel
      if (message.channel.id === logChannel.id) return;

      // For MessageDelete audit logs, the target is the user whose message was deleted
      const log = await findMatchingAuditEntry(
        message.guild,
        AuditLogEvent.MessageDelete,
        { targetId: message.author?.id, channelId: message.channel?.id, eventTimeMs: Date.now() }
      );
      const executor = log?.executor;

      const trim = (val) => {
        if (val == null || val === '') return '*No content*';
        const str = String(val);
        return str.length > 1000 ? `${str.slice(0, 1000)}…` : str;
      };

      const embed = new EmbedBuilder()
        .setTitle('Message Deleted')
        .setDescription(`A message by \`${message.author.tag}\` was deleted${executor ? ` by \`${executor.tag}\`` : ''}`)
        .addFields(
          { name: 'Content', value: trim(message.content) },
          { name: 'Channel', value: `\`${message.channel.name}\`` },
          { name: 'Message ID', value: `\`${message.id}\`` },
          { name: 'Author ID', value: `\`${message.author.id}\`` },
          { name: 'Created At', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>` }
        )
        .setColor('Red')
        .setTimestamp();

      if (message.attachments.size > 0) {
        embed.addFields({
          name: 'Attachments',
          value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n')
        });
      }

      if (message.embeds.length > 0) {
        embed.addFields({
          name: 'Embeds',
          value: `\`\`\`json\n${JSON.stringify(message.embeds, null, 2).slice(0, 1000)}\`\`\``
        });
      }

      logEmbed(message.guild, embed);
      if (executor) {
        await db.logModerationAction(executor.id, message.guild.id, 'SYSTEM', 'MESSAGE_DELETE', `Deleted message from ${message.author.tag}`);
      }
    } catch (error) {
      handleError(message.guild, error, 'messageDelete');
    }
  });

  client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.partial || newMessage.partial) return;

    try {
      const logChannel = await getLogChannel(newMessage.guild);
      if (!logChannel) return;

      // Skip logging if the message is in the log channel
      if (newMessage.channel.id === logChannel.id) return;

      const trim = (val) => {
        if (val == null || val === '') return '*No content*';
        const str = String(val);
        return str.length > 1000 ? `${str.slice(0, 1000)}…` : str;
      };

      const embed = new EmbedBuilder()
        .setTitle('Message Edited')
        .setDescription(`A message by \`${newMessage.author.tag}\` was edited`)
        .addFields(
          { name: 'Old Content', value: trim(oldMessage.content) },
          { name: 'New Content', value: trim(newMessage.content) },
          { name: 'Channel', value: `\`${newMessage.channel.name}\`` },
          { name: 'Message ID', value: `\`${newMessage.id}\`` },
          { name: 'Author ID', value: `\`${newMessage.author.id}\`` },
          { name: 'Created At', value: `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:R>` }
        )
        .setColor('Yellow')
        .setTimestamp();

      logEmbed(newMessage.guild, embed);
      await db.logModerationAction(newMessage.author.id, newMessage.guild.id, 'SYSTEM', 'MESSAGE_EDIT', `Edited message in ${newMessage.channel.name}`);
    } catch (error) {
      handleError(newMessage.guild, error, 'messageUpdate');
    }
  });

  // ========================== Role Assignment/Removal ==========================
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

      // Fetch audit logs for role updates
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 5
      });

      const roleLog = auditLogs.entries.find(entry =>
        entry.target?.id === newMember.id &&
        (entry.changes?.some(change =>
          change.key === '$add' || change.key === '$remove'
        ))
      );

      const executor = roleLog?.executor || newMember.user;

      // Handle added roles
      for (const role of addedRoles.values()) {
        const embed = new EmbedBuilder()
          .setTitle('Role Assigned')
          .setDescription(`\`${newMember.user.tag}\` was given the role \`${role.name}\` by \`${executor.tag}\`.`)
          .addFields(
            { name: 'Role Name', value: `\`${role.name}\``, inline: true },
            { name: 'Role ID', value: `\`${role.id}\``, inline: true },
            { name: 'Role Color', value: `\`${role.hexColor}\``, inline: true },
            { name: 'Role Position', value: `\`${role.position}\``, inline: true }
          )
          .setColor('Blue')
          .setTimestamp();
        await logEmbed(newMember.guild, embed);
      }

      // Handle removed roles
      for (const role of removedRoles.values()) {
        const embed = new EmbedBuilder()
          .setTitle('Role Removed')
          .setDescription(`\`${newMember.user.tag}\` had the role \`${role.name}\` removed by \`${executor.tag}\`.`)
          .addFields(
            { name: 'Role Name', value: `\`${role.name}\``, inline: true },
            { name: 'Role ID', value: `\`${role.id}\``, inline: true },
            { name: 'Role Color', value: `\`${role.hexColor}\``, inline: true },
            { name: 'Role Position', value: `\`${role.position}\``, inline: true }
          )
          .setColor('Red')
          .setTimestamp();
        await logEmbed(newMember.guild, embed);
      }

      // Nickname changes
      if (oldMember.nickname !== newMember.nickname) {
        const embed = new EmbedBuilder()
          .setTitle('Nickname Changed')
          .setDescription(`\`${newMember.user.tag}\` had their nickname changed by \`${executor.tag}\`.`)
          .addFields(
            { name: 'Old Nickname', value: oldMember.nickname || 'None', inline: true },
            { name: 'New Nickname', value: newMember.nickname || 'None', inline: true },
            { name: 'User ID', value: `\`${newMember.user.id}\``, inline: true }
          )
          .setColor('Yellow')
          .setTimestamp();
        await logEmbed(newMember.guild, embed);
      }
    } catch (error) {
      handleError(newMember.guild, error, 'guildMemberUpdate');
    }
  });

  // ========================== Kicks/Bans/Unbans ==========================
  client.on('guildMemberRemove', async (member) => {
    try {
      const log = await findMatchingAuditEntry(member.guild, AuditLogEvent.MemberKick, { targetId: member.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) {
        const embed = new EmbedBuilder()
          .setTitle('Member Left')
          .setDescription(`\`${member.user.tag}\` left the server`)
          .addFields(
            { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
            { name: 'Account Age', value: `\`${Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24))} days\``, inline: true },
            { name: 'Joined Server', value: member.joinedTimestamp ? `\`${Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))} days ago\`` : 'Unknown', inline: true },
            { name: 'Roles', value: member.roles?.cache?.map(r => r.name).join(', ') || 'None' }
          )
          .setColor('Grey')
          .setTimestamp();
        return logEmbed(member.guild, embed);
      }

      // Check for mass kick
      const recentKicks = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 5
      });

      if (recentKicks.entries.size >= 3) {
        await nukeProtection.handleMassKick(member.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Member Kicked')
        .setDescription(`\`${member.user.tag}\` was kicked by \`${executor.tag}\``)
        .addFields(
          { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
          { name: 'Account Age', value: `\`${Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24))} days\``, inline: true },
          { name: 'Joined Server', value: `\`${Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))} days ago\``, inline: true },
          { name: 'Roles', value: member.roles.cache.map(r => r.name).join(', ') || 'None' }
        )
        .setColor('Red')
        .setTimestamp();

      logEmbed(member.guild, embed);
      await db.logModerationAction(executor.id, member.guild.id, 'SYSTEM', 'MEMBER_KICK', `Kicked ${member.user.tag}`);
    } catch (error) {
      handleError(member.guild, error, 'guildMemberRemove');
    }
  });

  client.on('guildBanAdd', async (ban) => {
    try {
      const log = await findMatchingAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, { targetId: ban.user.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      // Check for mass ban
      const recentBans = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 5
      });

      if (recentBans.entries.size >= 3) {
        await nukeProtection.handleMassBan(ban.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Member Banned')
        .setDescription(`\`${ban.user.tag}\` was banned by \`${executor.tag}\``)
        .addFields(
          { name: 'User ID', value: `\`${ban.user.id}\``, inline: true },
          { name: 'Account Age', value: `\`${Math.floor((Date.now() - ban.user.createdTimestamp) / (1000 * 60 * 60 * 24))} days\``, inline: true },
          { name: 'Reason', value: ban.reason || 'No reason provided' }
        )
        .setColor('DarkRed')
        .setTimestamp();

      logEmbed(ban.guild, embed);
      await db.logModerationAction(executor.id, ban.guild.id, 'SYSTEM', 'MEMBER_BAN', `Banned ${ban.user.tag}`);
    } catch (error) {
      handleError(ban.guild, error, 'guildBanAdd');
    }
  });

  client.on('guildBanRemove', async (ban) => {
    try {
      const log = await findMatchingAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, { targetId: ban.user.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const embed = new EmbedBuilder()
        .setTitle('User Unbanned')
        .setDescription(`\`${ban.user.tag}\` was unbanned by \`${executor.tag}\``)
        .addFields(
          { name: 'User ID', value: `\`${ban.user.id}\``, inline: true },
          { name: 'Account Age', value: `\`${Math.floor((Date.now() - ban.user.createdTimestamp) / (1000 * 60 * 60 * 24))} days\``, inline: true }
        )
        .setColor('Green')
        .setTimestamp();

      logEmbed(ban.guild, embed);
      await db.logModerationAction(executor.id, ban.guild.id, 'SYSTEM', 'MEMBER_UNBAN', `Unbanned ${ban.user.tag}`);
    } catch (error) {
      handleError(ban.guild, error, 'guildBanRemove');
    }
  });

  // ========================== Channel Events ==========================
  client.on('channelCreate', async (channel) => {
    try {
      const logChannel = await getLogChannel(channel.guild);
      if (!logChannel) return;

      // Skip logging if the channel is the log channel
      if (channel.id === logChannel.id) return;

      const log = await findMatchingAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, { targetId: channel.id, eventTimeMs: channel.createdTimestamp || Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      // Check for mass channel creation
      const recentChannelCreations = await channel.guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelCreate,
        limit: 5
      });

      if (recentChannelCreations.entries.size >= 3) {
        await nukeProtection.handleMassChannelCreation(channel.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Channel Created')
        .setDescription(`A new ${channel.type} channel was created by \`${executor.tag}\``)
        .addFields(
          { name: 'Channel Name', value: `\`${channel.name}\``, inline: true },
          { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
          { name: 'Type', value: `\`${channel.type}\``, inline: true },
          { name: 'Category', value: channel.parent ? `\`${channel.parent.name}\`` : 'None', inline: true },
          { name: 'NSFW', value: `\`${channel.nsfw}\``, inline: true },
          { name: 'Position', value: `\`${channel.position}\``, inline: true }
        )
        .setColor('Green')
        .setTimestamp();

      logEmbed(channel.guild, embed);
      await db.logModerationAction(executor.id, channel.guild.id, 'SYSTEM', 'CHANNEL_CREATE', `Created channel ${channel.name}`);
    } catch (error) {
      handleError(channel.guild, error, 'channelCreate');
    }
  });

  client.on('channelDelete', async (channel) => {
    try {
      const logChannel = await getLogChannel(channel.guild);
      if (!logChannel) return;

      // Skip logging if the channel is the log channel
      if (channel.id === logChannel.id) return;

      const log = await findMatchingAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, { targetId: channel.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      // Check for mass channel deletion
      const recentChannelDeletions = await channel.guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelDelete,
        limit: 5
      });

      if (recentChannelDeletions.entries.size >= 3) {
        await nukeProtection.handleMassChannelDeletion(channel.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Channel Deleted')
        .setDescription(`The ${channel.type} channel \`${channel.name}\` was deleted by \`${executor.tag}\``)
        .addFields(
          { name: 'Channel Name', value: `\`${channel.name}\``, inline: true },
          { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
          { name: 'Type', value: `\`${channel.type}\``, inline: true },
          { name: 'Category', value: channel.parent ? `\`${channel.parent.name}\`` : 'None', inline: true }
        )
        .setColor('Red')
        .setTimestamp();

      logEmbed(channel.guild, embed);
      await db.logModerationAction(executor.id, channel.guild.id, 'SYSTEM', 'CHANNEL_DELETE', `Deleted channel ${channel.name}`);
    } catch (error) {
      handleError(channel.guild, error, 'channelDelete');
    }
  });

  client.on('channelUpdate', async (oldChannel, newChannel) => {
    try {
      const logChannel = await getLogChannel(newChannel.guild);
      if (!logChannel) return;

      // Skip logging if the channel is the log channel
      if (newChannel.id === logChannel.id) return;

      const log = await findMatchingAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, { targetId: newChannel.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const changes = [];
      if (oldChannel.name !== newChannel.name) {
        changes.push({ name: 'Name', value: `\`${oldChannel.name}\` → \`${newChannel.name}\`` });
      }
      if (oldChannel.parent !== newChannel.parent) {
        changes.push({
          name: 'Category',
          value: `${oldChannel.parent ? `\`${oldChannel.parent.name}\`` : 'None'} → ${newChannel.parent ? `\`${newChannel.parent.name}\`` : 'None'}`
        });
      }
      if (oldChannel.topic !== newChannel.topic) {
        changes.push({ name: 'Topic', value: 'Updated' });
      }
      if (oldChannel.nsfw !== newChannel.nsfw) {
        changes.push({ name: 'NSFW', value: `\`${oldChannel.nsfw}\` → \`${newChannel.nsfw}\`` });
      }
      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push({ name: 'Slowmode', value: `\`${oldChannel.rateLimitPerUser}\` → \`${newChannel.rateLimitPerUser}\`` });
      }

      if (changes.length > 0) {
        const embed = new EmbedBuilder()
          .setTitle('Channel Updated')
          .setDescription(`The ${oldChannel.type} channel \`${oldChannel.name}\` was updated by \`${executor.tag}\``)
          .addFields(changes)
          .setColor('Yellow')
          .setTimestamp();

        logEmbed(newChannel.guild, embed);
        await db.logModerationAction(executor.id, newChannel.guild.id, 'SYSTEM', 'CHANNEL_UPDATE', `Updated channel ${oldChannel.name}`);
      }
    } catch (error) {
      handleError(newChannel.guild, error, 'channelUpdate');
    }
  });

  // ========================== Voice Channel Events ==========================
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      // Handle voice channel joins
      if (!oldState.channelId && newState.channelId) {
        const embed = new EmbedBuilder()
          .setTitle('User Joined Voice Channel')
          .setDescription(`\`${newState.member.user.tag}\` joined \`${newState.channel.name}\``)
          .addFields(
            { name: 'User ID', value: `\`${newState.member.user.id}\``, inline: true },
            { name: 'Channel', value: `\`${newState.channel.name}\``, inline: true },
            { name: 'Channel ID', value: `\`${newState.channel.id}\``, inline: true }
          )
          .setColor('Green')
          .setTimestamp();

        logEmbed(newState.guild, embed);
      }
      // Handle voice channel leaves
      else if (oldState.channelId && !newState.channelId) {
        const log = await findMatchingAuditEntry(oldState.guild, AuditLogEvent.MemberDisconnect, { targetId: oldState.member?.user?.id, channelId: oldState.channel?.id, eventTimeMs: Date.now() });
        const executor = log?.executor;

        const embed = new EmbedBuilder()
          .setTitle('User Left Voice Channel')
          .setDescription(`\`${oldState.member.user.tag}\` left \`${oldState.channel.name}\`${executor ? ` (disconnected by \`${executor.tag}\`)` : ''}`)
          .addFields(
            { name: 'User ID', value: `\`${oldState.member.user.id}\``, inline: true },
            { name: 'Channel', value: `\`${oldState.channel.name}\``, inline: true },
            { name: 'Channel ID', value: `\`${oldState.channel.id}\``, inline: true },
            { name: 'Was Muted', value: `\`${oldState.mute}\``, inline: true },
            { name: 'Was Deafened', value: `\`${oldState.deaf}\``, inline: true }
          )
          .setColor('Red')
          .setTimestamp();

        logEmbed(oldState.guild, embed);
      }
      // Handle voice channel switches
      else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const embed = new EmbedBuilder()
          .setTitle('User Switched Voice Channel')
          .setDescription(`\`${newState.member.user.tag}\` switched voice channels`)
          .addFields(
            { name: 'User ID', value: `\`${newState.member.user.id}\``, inline: true },
            { name: 'From', value: `\`${oldState.channel.name}\``, inline: true },
            { name: 'To', value: `\`${newState.channel.name}\``, inline: true }
          )
          .setColor('Yellow')
          .setTimestamp();

        logEmbed(newState.guild, embed);
      }
    } catch (error) {
      handleError(newState.guild || oldState.guild, error, 'voiceStateUpdate');
    }
  });
};