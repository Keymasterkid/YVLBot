const { EmbedBuilder, AuditLogEvent, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./database');

class NukeProtection {
    constructor() {
        this.protectedServers = new Set();
        this.actionHistory = new Map();
        this.messageHistory = new Map();
        this.settings = {};
        this.cooldowns = new Map();
        this.slowNukeHistory = new Map();
        this.webhookHistory = new Map();
        this.actionThresholds = {
            roleCreate: 3,    // Number of roles created within cooldown period
            roleDelete: 3,    // Number of roles deleted within cooldown period
            channelCreate: 3, // Number of channels created within cooldown period
            channelDelete: 3, // Number of channels deleted within cooldown period
            ban: 5,          // Number of bans within cooldown period
            kick: 5,         // Number of kicks within cooldown period
            emojiCreate: 5,  // Number of emojis created within cooldown period
            emojiDelete: 5,  // Number of emojis deleted within cooldown period
            webhookCreate: 3, // Number of webhooks created within cooldown period
            spam: {
                messageCount: 5,    // Number of identical messages
                channelCount: 3,    // Number of different channels
                timeWindow: 10000,  // 10 seconds window
                similarityThreshold: 0.8 // 80% similarity for spam detection
            },
            slowNuke: {
                timeWindow: 3600000, // 1 hour window for slow nuke detection
                actionThreshold: 10, // Number of actions to trigger slow nuke detection
                botOnly: true        // Only detect slow nukes for bots
            }
        };
        this.cooldownPeriod = 10000; // 10 seconds cooldown
    }

    async initialize() {
        try {
            console.log('Initializing nuke protection system...');
            await db.connect();
            await this.loadSettings();
            console.log('Nuke protection system initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing nuke protection:', error);
            return false;
        }
    }

    async loadSettings() {
        try {
            console.log('Loading nuke protection settings for all servers...');
            const servers = await db.getAllServers();
            for (const server of servers) {
                const settings = await db.getNukeProtectionSettings(server.server_id);
                const enabledFinal = (server.nuke_protection === 1) || (settings?.enabled === 1);

                this.settings[server.server_id] = {
                    enabled: enabledFinal,
                    roleCreationLimit: settings?.role_creation_limit || 5,
                    roleDeletionLimit: settings?.role_deletion_limit || 5,
                    channelCreationLimit: settings?.channel_creation_limit || 5,
                    channelDeletionLimit: settings?.channel_deletion_limit || 5,
                    emojiCreationLimit: settings?.emoji_creation_limit || 5,
                    emojiDeletionLimit: settings?.emoji_deletion_limit || 5,
                    webhookCreationLimit: settings?.webhook_creation_limit || 5,
                    banLimit: settings?.ban_limit || 5,
                    kickLimit: settings?.kick_limit || 5,
                    spamMessageCount: settings?.spam_message_count || 5,
                    spamChannelCount: settings?.spam_channel_count || 3,
                    spamTimeWindow: settings?.spam_time_window || 10000,
                    spamSimilarityThreshold: settings?.spam_similarity_threshold || 0.8,
                    slowNukeTimeWindow: settings?.slow_nuke_time_window || 3600000,
                    slowNukeActionThreshold: settings?.slow_nuke_action_threshold || 10,
                    slowNukeBotOnly: settings?.slow_nuke_bot_only || 1,
                    alertChannel: settings?.alert_channel || null
                };
                if (enabledFinal) {
                    this.protectedServers.add(server.server_id);
                } else {
                    this.protectedServers.delete(server.server_id);
                }
            }
            console.log(`Settings loaded for ${servers.length} servers`);
        } catch (error) {
            console.error('Error loading nuke protection settings:', error);
        }
    }

    async enable(serverId) {
        try {
            console.log('Enabling nuke protection for server:', serverId);
            // Update the servers table
            await db.run('UPDATE servers SET nuke_protection = 1 WHERE server_id = ?', [serverId]);
            // Update the nuke protection settings
            await db.updateNukeProtectionSettings(serverId, { enabled: 1 });
            // Update in-memory state
            this.protectedServers.add(serverId);
            // Update settings in memory
            if (!this.settings[serverId]) {
                this.settings[serverId] = {};
            }
            this.settings[serverId].enabled = true;
            return true;
        } catch (error) {
            console.error(`Error enabling nuke protection for server ${serverId}:`, error);
            return false;
        }
    }

    async disable(serverId) {
        try {
            console.log('Disabling nuke protection for server:', serverId);
            // Update the servers table
            await db.run('UPDATE servers SET nuke_protection = 0 WHERE server_id = ?', [serverId]);
            // Update the nuke protection settings
            await db.updateNukeProtectionSettings(serverId, { enabled: 0 });
            // Update in-memory state
            this.protectedServers.delete(serverId);
            // Update settings in memory
            if (!this.settings[serverId]) {
                this.settings[serverId] = {};
            }
            this.settings[serverId].enabled = false;
            return true;
        } catch (error) {
            console.error(`Error disabling nuke protection for server ${serverId}:`, error);
            return false;
        }
    }

    isProtected(serverId) {
        const enabledInSettings = this.settings[serverId]?.enabled === true || this.settings[serverId]?.enabled === 1;
        const enabledInSet = this.protectedServers.has(serverId);
        return enabledInSettings || enabledInSet;
    }

    async getSettings(serverId) {
        try {
            const settings = await db.getNukeProtectionSettings(serverId);
            return settings;
        } catch (error) {
            console.error(`Error getting settings for server ${serverId}:`, error);
            return null;
        }
    }

    async updateSettings(serverId, settings) {
        try {
            console.log('Updating settings for server:', serverId);
            await db.updateNukeProtectionSettings(serverId, settings);

            // Refresh in-memory cache for this server from DB to keep camelCase mapping consistent
            const latest = await db.getNukeProtectionSettings(serverId);
            if (!this.settings[serverId]) this.settings[serverId] = {};
            const currentEnabled = this.settings[serverId].enabled === true || this.settings[serverId].enabled === 1;
            this.settings[serverId] = {
                enabled: currentEnabled,
                roleCreationLimit: latest?.role_creation_limit ?? this.settings[serverId].roleCreationLimit ?? 5,
                roleDeletionLimit: latest?.role_deletion_limit ?? this.settings[serverId].roleDeletionLimit ?? 5,
                channelCreationLimit: latest?.channel_creation_limit ?? this.settings[serverId].channelCreationLimit ?? 5,
                channelDeletionLimit: latest?.channel_deletion_limit ?? this.settings[serverId].channelDeletionLimit ?? 5,
                emojiCreationLimit: latest?.emoji_creation_limit ?? this.settings[serverId].emojiCreationLimit ?? 5,
                emojiDeletionLimit: latest?.emoji_deletion_limit ?? this.settings[serverId].emojiDeletionLimit ?? 5,
                webhookCreationLimit: latest?.webhook_creation_limit ?? this.settings[serverId].webhookCreationLimit ?? 5,
                banLimit: latest?.ban_limit ?? this.settings[serverId].banLimit ?? 5,
                kickLimit: latest?.kick_limit ?? this.settings[serverId].kickLimit ?? 5,
                spamMessageCount: latest?.spam_message_count ?? this.settings[serverId].spamMessageCount ?? 5,
                spamChannelCount: latest?.spam_channel_count ?? this.settings[serverId].spamChannelCount ?? 3,
                spamTimeWindow: latest?.spam_time_window ?? this.settings[serverId].spamTimeWindow ?? 10000,
                spamSimilarityThreshold: latest?.spam_similarity_threshold ?? this.settings[serverId].spamSimilarityThreshold ?? 0.8,
                slowNukeTimeWindow: latest?.slow_nuke_time_window ?? this.settings[serverId].slowNukeTimeWindow ?? 3600000,
                slowNukeActionThreshold: latest?.slow_nuke_action_threshold ?? this.settings[serverId].slowNukeActionThreshold ?? 10,
                slowNukeBotOnly: latest?.slow_nuke_bot_only ?? this.settings[serverId].slowNukeBotOnly ?? 1,
                alertChannel: latest?.alert_channel ?? this.settings[serverId].alertChannel ?? null
            };
            return true;
        } catch (error) {
            console.error(`Error updating settings for server ${serverId}:`, error);
            return false;
        }
    }

    // Check if an action exceeds the threshold within the cooldown period
    checkActionThreshold(guildId, actionType) {
        const now = Date.now();
        const key = `${guildId}-${actionType}`;

        if (!this.cooldowns.has(key)) {
            this.cooldowns.set(key, {
                count: 1,
                timestamp: now
            });
            return false;
        }

        const action = this.cooldowns.get(key);
        if (now - action.timestamp > this.cooldownPeriod) {
            action.count = 1;
            action.timestamp = now;
            return false;
        }

        action.count++;
        return action.count >= this.actionThresholds[actionType];
    }

    // Handle mass role creation
    async handleMassRoleCreation(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'roleCreate')) return false;

        console.log(`[NukeProtection] Handling mass role creation for guild ${guild.id} by ${executor.tag}`);

        try {
            // Track the action for slow nuke detection
            await this.trackSlowNuke(guild, executor, 'ROLE_CREATE');

            if (executor.bot) {
                console.log('[NukeProtection] Banning bot for mass role creation');
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass role creation' });
                await this.sendAlert(guild, executor, 'Mass Role Creation', 'Bot attempted to create multiple roles');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                console.log('[NukeProtection] Removing roles from user');
                await member.roles.set([]);
            }

            // Send alert for mass role creation
            await this.sendAlert(guild, executor, 'Mass Role Creation', 'User attempted to create multiple roles');

            // Log to database
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass role creation attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass role creation:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass role creation: ${error.message}`);
            return false;
        }
    }

    // Handle mass role deletion
    async handleMassRoleDeletion(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'roleDelete')) return false;

        try {
            await this.trackSlowNuke(guild, executor, 'ROLE_DELETE');

            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass role deletion' });
                await this.sendAlert(guild, executor, 'Mass Role Deletion', 'Bot attempted to delete multiple roles');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await this.sendAlert(guild, executor, 'Mass Role Deletion', 'User attempted to delete multiple roles');
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass role deletion attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass role deletion:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass role deletion: ${error.message}`);
            return false;
        }
    }

    // Handle mass channel creation
    async handleMassChannelCreation(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'channelCreate')) return false;

        try {
            await this.trackSlowNuke(guild, executor, 'CHANNEL_CREATE');

            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass channel creation' });
                await this.sendAlert(guild, executor, 'Mass Channel Creation', 'Bot attempted to create multiple channels');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await this.sendAlert(guild, executor, 'Mass Channel Creation', 'User attempted to create multiple channels');
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass channel creation attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass channel creation:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass channel creation: ${error.message}`);
            return false;
        }
    }

    // Handle mass channel deletion
    async handleMassChannelDeletion(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'channelDelete')) return false;

        try {
            await this.trackSlowNuke(guild, executor, 'CHANNEL_DELETE');

            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass channel deletion' });
                await this.sendAlert(guild, executor, 'Mass Channel Deletion', 'Bot attempted to delete multiple channels');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await this.sendAlert(guild, executor, 'Mass Channel Deletion', 'User attempted to delete multiple channels');
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass channel deletion attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass channel deletion:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass channel deletion: ${error.message}`);
            return false;
        }
    }

    // Handle mass emoji creation
    async handleMassEmojiCreation(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'emojiCreate')) return false;

        try {
            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass emoji creation' });
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass emoji creation attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass emoji creation:', error);
            return false;
        }
    }

    // Handle mass emoji deletion
    async handleMassEmojiDeletion(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'emojiDelete')) return false;

        try {
            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass emoji deletion' });
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass emoji deletion attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass emoji deletion:', error);
            return false;
        }
    }

    // Handle mass webhook creation
    async handleMassWebhookCreation(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'webhookCreate')) return false;

        try {
            await this.trackSlowNuke(guild, executor, 'WEBHOOK_CREATE');

            if (executor.bot) {
                console.log('[NukeProtection] Banning bot for mass webhook creation');
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass webhook creation' });
                await this.sendAlert(guild, executor, 'Mass Webhook Creation', 'Bot attempted to create multiple webhooks');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                console.log('[NukeProtection] Removing roles from user');
                await member.roles.set([]);
            }

            await this.sendAlert(guild, executor, 'Mass Webhook Creation', 'User attempted to create multiple webhooks');
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass webhook creation attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass webhook creation:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass webhook creation: ${error.message}`);
            return false;
        }
    }

    // Handle mass ban
    async handleMassBan(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'ban')) return false;

        try {
            await this.trackSlowNuke(guild, executor, 'MASS_BAN');

            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass ban' });
                await this.sendAlert(guild, executor, 'Mass Ban', 'Bot attempted to ban multiple members');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await this.sendAlert(guild, executor, 'Mass Ban', 'User attempted to ban multiple members');
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass ban attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass ban:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass ban: ${error.message}`);
            return false;
        }
    }

    // Handle mass kick
    async handleMassKick(guild, executor) {
        if (!this.isProtected(guild.id)) return false;
        if (!this.checkActionThreshold(guild.id, 'kick')) return false;

        try {
            await this.trackSlowNuke(guild, executor, 'MASS_KICK');

            if (executor.bot) {
                await guild.members.ban(executor.id, { reason: 'Nuke protection: Mass kick' });
                await this.sendAlert(guild, executor, 'Mass Kick', 'Bot attempted to kick multiple members');
                return true;
            }

            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.roles.set([]);
            }

            await this.sendAlert(guild, executor, 'Mass Kick', 'User attempted to kick multiple members');
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                'Mass kick attempt'
            );

            return true;
        } catch (error) {
            console.error('[NukeProtection] Error handling mass kick:', error);
            await this.sendAlert(guild, executor, 'Error', `Failed to handle mass kick: ${error.message}`);
            return false;
        }
    }

    // Calculate similarity between two messages
    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;
        return (longerLength - this.editDistance(longer, shorter)) / longerLength;
    }

    // Calculate edit distance between two strings
    editDistance(str1, str2) {
        str1 = str1.toLowerCase();
        str2 = str2.toLowerCase();

        const costs = [];
        for (let i = 0; i <= str1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= str2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[str2.length] = lastValue;
        }
        return costs[str2.length];
    }

    // Handle spam detection
    async handleSpam(message) {
        if (!this.isProtected(message.guild.id)) return false;

        // Initialize settings for this guild if they don't exist
        if (!this.settings[message.guild.id]) {
            this.settings[message.guild.id] = {
                spamTimeWindow: 10000,
                spamMessageCount: 5,
                spamChannelCount: 3,
                spamSimilarityThreshold: 0.8
            };
        }

        const userId = message.author.id;
        const currentTime = Date.now();

        // Initialize user's message history if not exists
        if (!this.messageHistory.has(userId)) {
            this.messageHistory.set(userId, []);
        }

        const userHistory = this.messageHistory.get(userId);
        userHistory.push({
            content: message.content,
            channelId: message.channel.id,
            timestamp: currentTime
        });

        // Remove old messages outside the time window
        const timeWindow = this.settings[message.guild.id].spamTimeWindow;
        const recentMessages = userHistory.filter(msg =>
            currentTime - msg.timestamp <= timeWindow
        );

        // Check if messages are similar and sent across multiple channels
        if (recentMessages.length >= this.settings[message.guild.id].spamMessageCount) {
            const uniqueChannels = new Set(recentMessages.map(msg => msg.channelId));

            if (uniqueChannels.size >= this.settings[message.guild.id].spamChannelCount) {
                const similarMessages = recentMessages.filter(msg =>
                    this.calculateSimilarity(message.content, msg.content) >= this.settings[message.guild.id].spamSimilarityThreshold
                );

                if (similarMessages.length >= this.settings[message.guild.id].spamMessageCount) {
                    await this.trackSlowNuke(message.guild, message.author, 'SPAM');
                    await this.sendAlert(message.guild, message.author, 'Spam Detection',
                        `User sent ${similarMessages.length} similar messages across ${uniqueChannels.size} channels`
                    );
                    return true;
                }
            }
        }

        // Update message history
        this.messageHistory.set(userId, recentMessages);
        return false;
    }

    async sendAlert(guild, executor, actionType, details) {
        try {
            // Get log channel from database
            const logChannelId = await db.getLogChannel(guild.id);

            if (!logChannelId) {
                return;
            }

            // Get the channel from cache
            const logChannel = guild.channels.cache.get(logChannelId);

            if (!logChannel) {
                // Try to fetch the channel
                try {
                    const fetchedChannel = await guild.channels.fetch(logChannelId);
                    if (!fetchedChannel) {
                        return;
                    }
                } catch (fetchError) {
                    console.error('[NukeProtection] Error fetching log channel:', fetchError);
                    return;
                }
            }

            // Calculate account age
            const accountAge = this.getAccountAge(executor);

            // Get user's roles
            const member = await guild.members.fetch(executor.id).catch(() => null);
            const roles = member ? member.roles.cache.map(r => r.name).join(', ') : 'Unknown';

            // Get recent actions by this user
            const recentActions = this.getRecentActions(guild.id, executor.id);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 Nuke Protection Alert')
                .setDescription(`@here A potential nuke attempt has been detected!`)
                .addFields(
                    { name: 'Action Type', value: actionType, inline: true },
                    { name: 'Executor', value: `${executor.tag} (${executor.id})`, inline: true },
                    { name: 'Is Bot', value: executor.bot ? 'Yes' : 'No', inline: true },
                    { name: 'Account Age', value: accountAge, inline: true },
                    { name: 'User Roles', value: roles || 'None', inline: true },
                    { name: 'Details', value: details },
                    { name: 'Recent Actions', value: recentActions || 'None' }
                )
                .setThumbnail(executor.displayAvatarURL())
                .setTimestamp();

            // Add action buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('ban_user')
                        .setLabel('Ban User')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('kick_user')
                        .setLabel('Kick User')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('remove_roles')
                        .setLabel('Remove Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            const alertMessage = await logChannel.send({
                content: '@here',
                embeds: [embed],
                components: [row]
            });

            // Create a collector for the buttons
            const collector = alertMessage.createMessageComponentCollector({
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                if (!interaction.member.permissions.has('Administrator')) {
                    return interaction.reply({
                        content: 'You need Administrator permissions to use these buttons.',
                        ephemeral: true
                    });
                }

                try {
                    switch (interaction.customId) {
                        case 'ban_user':
                            await guild.members.ban(executor.id, {
                                reason: `Nuke protection: ${actionType}`
                            });
                            await interaction.reply({
                                content: `✅ Successfully banned ${executor.tag}`,
                                ephemeral: true
                            });
                            break;
                        case 'kick_user':
                            await guild.members.kick(executor.id, `Nuke protection: ${actionType}`);
                            await interaction.reply({
                                content: `✅ Successfully kicked ${executor.tag}`,
                                ephemeral: true
                            });
                            break;
                        case 'remove_roles':
                            const targetMember = await guild.members.fetch(executor.id);
                            if (targetMember) {
                                await targetMember.roles.set([]);
                                await interaction.reply({
                                    content: `✅ Successfully removed all roles from ${executor.tag}`,
                                    ephemeral: true
                                });
                            }
                            break;
                    }
                } catch (error) {
                    console.error('[NukeProtection] Error handling button interaction:', error);
                    await interaction.reply({
                        content: '❌ An error occurred while processing your action.',
                        ephemeral: true
                    });
                }
            });

            collector.on('end', () => {
                // Disable buttons after collector ends
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('ban_user')
                            .setLabel('Ban User')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('kick_user')
                            .setLabel('Kick User')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('remove_roles')
                            .setLabel('Remove Roles')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true)
                    );
                alertMessage.edit({ components: [disabledRow] }).catch(console.error);
            });

            // Log to database
            await db.logModerationAction(
                executor.id,
                guild.id,
                'SYSTEM',
                'NUKE_PROTECTION',
                `${actionType}: ${details}`
            );
        } catch (error) {
            console.error('[NukeProtection] Error in sendAlert:', error);
            // Try to log the error to a default channel if available
            try {
                const defaultChannel = guild.systemChannel || guild.channels.cache.find(c => c.type === 'GUILD_TEXT');
                if (defaultChannel) {
                    await defaultChannel.send(`⚠️ Error sending nuke protection alert: ${error.message}`);
                }
            } catch (defaultError) {
                console.error('[NukeProtection] Error sending to default channel:', defaultError);
            }
        }
    }

    getAccountAge(user) {
        const accountAge = Date.now() - user.createdTimestamp;
        const days = Math.floor(accountAge / (1000 * 60 * 60 * 24));
        const hours = Math.floor((accountAge % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h`;
    }

    async trackSlowNuke(guild, executor, actionType) {
        if (!executor.bot && this.actionThresholds.slowNuke.botOnly) return;

        const key = `${guild.id}-${executor.id}`;
        const now = Date.now();
        const timeWindow = this.actionThresholds.slowNuke.timeWindow;

        if (!this.slowNukeHistory.has(key)) {
            this.slowNukeHistory.set(key, {
                actions: [],
                firstAction: now,
                lastAction: now
            });
        }

        const history = this.slowNukeHistory.get(key);
        history.actions.push({ type: actionType, timestamp: now });
        history.lastAction = now;

        // Remove actions outside the time window
        history.actions = history.actions.filter(action =>
            now - action.timestamp <= timeWindow
        );

        // Check if we've exceeded the threshold
        if (history.actions.length >= this.actionThresholds.slowNuke.actionThreshold) {
            console.log('[NukeProtection] Slow nuke threshold exceeded, sending alert');
            const details = `Detected ${history.actions.length} actions within ${timeWindow / 3600000} hours`;
            await this.sendAlert(guild, executor, 'Slow Nuke Detection', details);

            // Take action against the bot
            if (executor.bot) {
                try {
                    console.log('[NukeProtection] Banning bot for slow nuke attempt');
                    await guild.members.ban(executor.id, {
                        reason: 'Nuke protection: Slow nuke attempt detected'
                    });
                } catch (error) {
                    console.error('[NukeProtection] Error banning bot:', error);
                }
            }

            // Clear the history after taking action
            this.slowNukeHistory.delete(key);
        }
    }

    getRecentActions(guildId, userId) {
        const key = `${guildId}-${userId}`;
        if (!this.slowNukeHistory.has(key)) return null;

        const history = this.slowNukeHistory.get(key);
        const actions = history.actions.map(action =>
            `${action.type} (${new Date(action.timestamp).toLocaleTimeString()})`
        ).join('\n');

        return actions || 'No recent actions';
    }
}

// Create and export a singleton instance
const nukeProtection = new NukeProtection();
module.exports = nukeProtection;