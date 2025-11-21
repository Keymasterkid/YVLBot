const { Client, EmbedBuilder, AuditLogEvent } = require('discord.js');
const nukeProtection = require('./utils/nukeProtection');

// Keep track of recent logs to prevent duplicates
const recentLogs = new Map();
const LOG_COOLDOWN = 30000; // 30 seconds cooldown
const AUDIT_LOG_DELAY = 3500; // Delay for audit logs to arrive
const AUDIT_MATCH_WINDOW_MS = 10000; // Max difference between event and audit entry

module.exports = async (client, db) => {
  async function getLogChannel(guild) {
    try {
      const channelId = await db.getLogChannel(guild.id);
      if (!channelId) return null;

      let channel = guild.channels.cache.get(channelId);
      if (!channel) {
        try {
          channel = await guild.channels.fetch(channelId).catch(() => null);
        } catch (_) {
          channel = null;
        }
      }
      return channel?.isTextBased() ? channel : null;
    } catch (error) {
      console.error('Error getting log channel:', error);
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
      console.error('Error sending log embed:', error);
    }
  }

  function handleError(guild, error, event) {
    console.error(`Error during ${event}:`, error);

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
      console.error(`Failed to fetch audit logs for ${auditType}:`, error);
      return null;
    }
  }

  async function fetchAuditLogAfterDelay(guild, auditType, targetId = null) {
    await new Promise(resolve => setTimeout(resolve, AUDIT_LOG_DELAY));
    return await fetchAuditLogEntry(guild, auditType, targetId);
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
      console.error(`Failed to find matching audit entry for ${auditType}:`, error);
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
        console.log('Detected mass role creation, calling nuke protection');
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
          .setColor('Orange')
            .setTimestamp();
  
          logEmbed(oldState.guild, embed);
      }
      // Handle voice channel switches
      else if (oldState.channelId !== newState.channelId) {
        const embed = new EmbedBuilder()
          .setTitle('User Switched Voice Channel')
          .setDescription(`\`${newState.member.user.tag}\` switched from \`${oldState.channel.name}\` to \`${newState.channel.name}\``)
          .addFields(
            { name: 'User ID', value: `\`${newState.member.user.id}\``, inline: true },
            { name: 'Old Channel', value: `\`${oldState.channel.name}\``, inline: true },
            { name: 'New Channel', value: `\`${newState.channel.name}\``, inline: true }
          )
          .setColor('Blue')
          .setTimestamp();

        logEmbed(newState.guild, embed);
      }
      // Handle mute/deafen changes
      else if (oldState.mute !== newState.mute || oldState.deaf !== newState.deaf) {
        const changes = [];
        if (oldState.mute !== newState.mute) {
          changes.push(`Mute: \`${oldState.mute}\` → \`${newState.mute}\``);
        }
        if (oldState.deaf !== newState.deaf) {
          changes.push(`Deafen: \`${oldState.deaf}\` → \`${newState.deaf}\``);
        }

        const embed = new EmbedBuilder()
          .setTitle('Voice State Updated')
          .setDescription(`\`${newState.member.user.tag}\`'s voice state was updated`)
          .addFields(
            { name: 'User ID', value: `\`${newState.member.user.id}\``, inline: true },
            { name: 'Channel', value: `\`${newState.channel.name}\``, inline: true },
            { name: 'Changes', value: changes.join('\n') }
          )
          .setColor('Yellow')
          .setTimestamp();

        logEmbed(newState.guild, embed);
        }
      } catch (error) {
      handleError(newState.guild, error, 'voiceStateUpdate');
    }
  });

  // ========================== Thread Events ==========================
  client.on('threadCreate', async (thread) => {
    try {
      const log = await findMatchingAuditEntry(thread.guild, AuditLogEvent.ThreadCreate, { targetId: thread.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      const embed = new EmbedBuilder()
        .setTitle('Thread Created')
        .setDescription(`A new thread was created${executor ? ` by \`${executor.tag}\`` : ''}`)
        .addFields(
          { name: 'Thread Name', value: `\`${thread.name}\``, inline: true },
          { name: 'Thread ID', value: `\`${thread.id}\``, inline: true },
          { name: 'Parent Channel', value: `\`${thread.parent.name}\``, inline: true },
          { name: 'Auto Archive Duration', value: `\`${thread.autoArchiveDuration} minutes\``, inline: true },
          { name: 'Type', value: `\`${thread.type}\``, inline: true }
        )
        .setColor('Green')
        .setTimestamp();

      logEmbed(thread.guild, embed);
      if (executor) {
        await db.logModerationAction(executor.id, thread.guild.id, 'SYSTEM', 'THREAD_CREATE', `Created thread ${thread.name}`);
      }
    } catch (error) {
      handleError(thread.guild, error, 'threadCreate');
    }
  });

  client.on('threadDelete', async (thread) => {
    try {
      const log = await findMatchingAuditEntry(thread.guild, AuditLogEvent.ThreadDelete, { targetId: thread.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      const embed = new EmbedBuilder()
        .setTitle('Thread Deleted')
        .setDescription(`A thread was deleted${executor ? ` by \`${executor.tag}\`` : ''}`)
        .addFields(
          { name: 'Thread Name', value: `\`${thread.name}\``, inline: true },
          { name: 'Thread ID', value: `\`${thread.id}\``, inline: true },
          { name: 'Parent Channel', value: `\`${thread.parent.name}\``, inline: true },
          { name: 'Type', value: `\`${thread.type}\``, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

      logEmbed(thread.guild, embed);
      if (executor) {
        await db.logModerationAction(executor.id, thread.guild.id, 'SYSTEM', 'THREAD_DELETE', `Deleted thread ${thread.name}`);
      }
    } catch (error) {
      handleError(thread.guild, error, 'threadDelete');
    }
  });

  // ========================== Invite Events ==========================
  client.on('inviteCreate', async (invite) => {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Invite Created')
        .setDescription(`A new invite was created by \`${invite.inviter.tag}\``)
        .addFields(
          { name: 'Code', value: `\`${invite.code}\``, inline: true },
          { name: 'Channel', value: `\`${invite.channel.name}\``, inline: true },
          { name: 'Max Uses', value: `\`${invite.maxUses || 'Unlimited'}\``, inline: true },
          { name: 'Max Age', value: `\`${invite.maxAge ? invite.maxAge + ' seconds' : 'Never'}\``, inline: true },
          { name: 'Created By', value: `\`${invite.inviter.tag}\``, inline: true }
        )
        .setColor('Green')
        .setTimestamp();

      logEmbed(invite.guild, embed);
      await db.logModerationAction(invite.inviter.id, invite.guild.id, 'SYSTEM', 'INVITE_CREATE', `Created invite ${invite.code}`);
    } catch (error) {
      handleError(invite.guild, error, 'inviteCreate');
    }
  });

  client.on('inviteDelete', async (invite) => {
    try {
      const log = await findMatchingAuditEntry(invite.guild, AuditLogEvent.InviteDelete, { channelId: invite.channel?.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      const embed = new EmbedBuilder()
        .setTitle('Invite Deleted')
        .setDescription(`An invite was deleted${executor ? ` by \`${executor.tag}\`` : ''}`)
        .addFields(
          { name: 'Code', value: `\`${invite.code}\``, inline: true },
          { name: 'Channel', value: `\`${invite.channel.name}\``, inline: true },
          { name: 'Created By', value: `\`${invite.inviter.tag}\``, inline: true },
          { name: 'Uses', value: `\`${invite.uses}\``, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

      logEmbed(invite.guild, embed);
      if (executor) {
        await db.logModerationAction(executor.id, invite.guild.id, 'SYSTEM', 'INVITE_DELETE', `Deleted invite ${invite.code}`);
      }
    } catch (error) {
      handleError(invite.guild, error, 'inviteDelete');
    }
  });

  // ========================== Guild Events ==========================
  client.on('guildUpdate', async (oldGuild, newGuild) => {
    try {
      const log = await findMatchingAuditEntry(newGuild, AuditLogEvent.GuildUpdate, { eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      const changes = [];
      
      // Basic Info Changes
      if (oldGuild.name !== newGuild.name) {
        changes.push({ name: 'Name', value: `\`${oldGuild.name}\` → \`${newGuild.name}\`` });
      }
      if (oldGuild.icon !== newGuild.icon) {
        changes.push({ name: 'Icon', value: 'Updated' });
      }
      if (oldGuild.banner !== newGuild.banner) {
        changes.push({ name: 'Banner', value: 'Updated' });
      }
      if (oldGuild.splash !== newGuild.splash) {
        changes.push({ name: 'Splash', value: 'Updated' });
      }
      if (oldGuild.description !== newGuild.description) {
        changes.push({ 
          name: 'Description', 
          value: `${oldGuild.description ? `\`${oldGuild.description}\`` : 'None'} → ${newGuild.description ? `\`${newGuild.description}\`` : 'None'}` 
        });
      }

      // AFK Settings
      if (oldGuild.afkChannel !== newGuild.afkChannel) {
        changes.push({ 
          name: 'AFK Channel', 
          value: `${oldGuild.afkChannel ? `\`${oldGuild.afkChannel.name}\`` : 'None'} → ${newGuild.afkChannel ? `\`${newGuild.afkChannel.name}\`` : 'None'}` 
        });
      }
      if (oldGuild.afkTimeout !== newGuild.afkTimeout) {
        changes.push({ name: 'AFK Timeout', value: `\`${oldGuild.afkTimeout}\` → \`${newGuild.afkTimeout}\`` });
      }

      // Verification Level
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.push({ 
          name: 'Verification Level', 
          value: `\`${oldGuild.verificationLevel}\` → \`${newGuild.verificationLevel}\`` 
        });
      }

      // Content Filter
      if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
        changes.push({ 
          name: 'Content Filter', 
          value: `\`${oldGuild.explicitContentFilter}\` → \`${newGuild.explicitContentFilter}\`` 
        });
      }

      // Default Notification Settings
      if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
        changes.push({ 
          name: 'Default Notifications', 
          value: `\`${oldGuild.defaultMessageNotifications}\` → \`${newGuild.defaultMessageNotifications}\`` 
        });
      }

      // System Channel
      if (oldGuild.systemChannel !== newGuild.systemChannel) {
        changes.push({ 
          name: 'System Channel', 
          value: `${oldGuild.systemChannel ? `\`${oldGuild.systemChannel.name}\`` : 'None'} → ${newGuild.systemChannel ? `\`${newGuild.systemChannel.name}\`` : 'None'}` 
        });
      }

      // Rules Channel
      if (oldGuild.rulesChannel !== newGuild.rulesChannel) {
        changes.push({ 
          name: 'Rules Channel', 
          value: `${oldGuild.rulesChannel ? `\`${oldGuild.rulesChannel.name}\`` : 'None'} → ${newGuild.rulesChannel ? `\`${newGuild.rulesChannel.name}\`` : 'None'}` 
        });
      }

      // Public Updates Channel
      if (oldGuild.publicUpdatesChannel !== newGuild.publicUpdatesChannel) {
        changes.push({ 
          name: 'Public Updates Channel', 
          value: `${oldGuild.publicUpdatesChannel ? `\`${oldGuild.publicUpdatesChannel.name}\`` : 'None'} → ${newGuild.publicUpdatesChannel ? `\`${newGuild.publicUpdatesChannel.name}\`` : 'None'}` 
        });
      }

      if (changes.length > 0) {
        const embed = new EmbedBuilder()
          .setTitle('Guild Settings Updated')
          .setDescription(`Guild settings were updated by \`${executor.tag}\`.`)
          .addFields(changes)
          .setColor('Yellow')
          .setTimestamp();

        logEmbed(newGuild, embed);
        await db.logModerationAction(executor.id, newGuild.id, 'SYSTEM', 'GUILD_UPDATE', 'Updated guild settings');
      }
    } catch (error) {
      handleError(newGuild, error, 'guildUpdate');
    }
  });

  // ========================== Bulk Message Deletion ==========================
  client.on('messageDeleteBulk', async (messages) => {
    try {
      const firstMessage = messages.first();
      if (!firstMessage || !firstMessage.guild) return;

      const logChannel = await getLogChannel(firstMessage.guild);
      if (!logChannel) return;

      // Skip logging if the messages are in the log channel
      if (firstMessage.channel.id === logChannel.id) return;

      const log = await findMatchingAuditEntry(firstMessage.guild, AuditLogEvent.MessageBulkDelete, { channelId: firstMessage.channel?.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      // Get preview of up to 5 messages
      const messagePreviews = [];
      for (const message of messages.values()) {
        if (messagePreviews.length >= 5) break;
        if (message.content) {
          messagePreviews.push({
            author: message.author.tag,
            content: message.content.slice(0, 100) + (message.content.length > 100 ? '...' : ''),
            timestamp: message.createdTimestamp
          });
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('Bulk Messages Deleted')
        .setDescription(`${messages.size} messages were deleted${executor ? ` by \`${executor.tag}\`` : ''}`)
        .addFields(
          { name: 'Channel', value: `\`${firstMessage.channel.name}\``, inline: true },
          { name: 'Channel ID', value: `\`${firstMessage.channel.id}\``, inline: true },
          { name: 'Total Messages', value: `\`${messages.size}\``, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

      // Add message previews if any exist
      if (messagePreviews.length > 0) {
        const previewText = messagePreviews.map((msg, i) => 
          `${i + 1}. **${msg.author}** (<t:${Math.floor(msg.timestamp / 1000)}:R>):\n${msg.content}`
        ).join('\n\n');
        
        embed.addFields({
          name: 'Message Previews',
          value: previewText
        });
      }

      logEmbed(firstMessage.guild, embed);
      if (executor) {
        await db.logModerationAction(
          executor.id, 
          firstMessage.guild.id, 
          'SYSTEM', 
          'MESSAGE_BULK_DELETE', 
          `Deleted ${messages.size} messages in ${firstMessage.channel.name}`
        );
      }
    } catch (error) {
      handleError(firstMessage.guild, error, 'messageDeleteBulk');
    }
  });

  // ========================== Webhook Events ==========================
  client.on('webhookCreate', async (webhook) => {
    try {
      const log = await findMatchingAuditEntry(webhook.guild, AuditLogEvent.WebhookCreate, { channelId: webhook.channel?.id, eventTimeMs: Date.now() });
      const executor = log?.executor;

      if (!executor) return;

      // Check for mass webhook creation
      const recentWebhookCreations = await webhook.guild.fetchAuditLogs({
        type: AuditLogEvent.WebhookCreate,
        limit: 5
      });

      if (recentWebhookCreations.entries.size >= 3) {
        console.log('Detected mass webhook creation, calling nuke protection');
        await nukeProtection.handleMassWebhookCreation(webhook.guild, executor);
      }

      const embed = new EmbedBuilder()
        .setTitle('Webhook Created')
        .setDescription(`A new webhook was created by \`${executor.tag}\``)
        .addFields(
          { name: 'Webhook Name', value: `\`${webhook.name}\``, inline: true },
          { name: 'Webhook ID', value: `\`${webhook.id}\``, inline: true },
          { name: 'Channel', value: `\`${webhook.channel.name}\``, inline: true },
          { name: 'Type', value: `\`${webhook.type}\``, inline: true }
        )
        .setColor('Green')
        .setTimestamp();

      logEmbed(webhook.guild, embed);
      await db.logModerationAction(executor.id, webhook.guild.id, 'SYSTEM', 'WEBHOOK_CREATE', `Created webhook ${webhook.name}`);
    } catch (error) {
      handleError(webhook.guild, error, 'webhookCreate');
    }
  });

  // ========================== Spam Detection ==========================
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    try {
      // Check for spam
      await nukeProtection.handleSpam(message);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  // Initialize nuke protection
  await nukeProtection.initialize();
};