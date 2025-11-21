const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../utils/database');
const nukeProtection = require('../../utils/nukeProtection');

// Defaults for DB-backed settings (columns present in nuke_protection_settings)
const DB_DEFAULTS = {
    enabled: 0,
    role_creation_limit: 5,
    role_deletion_limit: 5,
    channel_creation_limit: 5,
    channel_deletion_limit: 5,
    emoji_creation_limit: 5,
    emoji_deletion_limit: 5,
    webhook_creation_limit: 5,
    ban_limit: 5,
    kick_limit: 5,
    spam_message_count: 5,
    spam_channel_count: 3,
    spam_time_window: 10000,
    spam_similarity_threshold: 0.8,
    slow_nuke_time_window: 3600000,
    slow_nuke_action_threshold: 10,
    slow_nuke_bot_only: 1,
    alert_channel: null
};

module.exports = {
    name: 'nukeprotection',
    description: 'Configure nuke protection settings for the server',
    usage: '!nukeprotection <enable/disable/settings/reset> [setting] [value]',
    permissions: ['Administrator'],
    async execute(message, args) {
        console.log('Executing nukeprotection command with args:', args);
        
        // Check if user has administrator permissions
        if (!message.member.permissions.has('Administrator')) {
            console.log('User lacks Administrator permission');
            return message.reply('You need Administrator permissions to use this command.');
        }

        try {
            // Initialize settings for the server if they don't exist
            console.log('Initializing settings for server:', message.guild.id);
            await db.initializeNukeProtectionSettings(message.guild.id);

            // Show current settings if no arguments
            if (!args[0]) {
                console.log('Showing current settings');
                const settings = await nukeProtection.getSettings(message.guild.id);
                if (!settings) {
                    console.log('Failed to load settings');
                    return message.reply('Error loading settings. Please try again later.');
                }
                console.log('Current settings:', settings);
                const isEnabled = nukeProtection.isProtected(message.guild.id);

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Nuke Protection Settings')
                    .setDescription('Current protection status and settings for this server.')
                    .addFields(
                        { name: 'Status', value: isEnabled ? 'Enabled' : 'Disabled', inline: true },
                        { name: 'Protected Actions', value: 
                            '• Mass role creation/deletion\n' +
                            '• Mass channel creation/deletion\n' +
                            '• Mass emoji creation/deletion\n' +
                            '• Mass webhook creation\n' +
                            '• Mass bans/kicks\n' +
                            '• Spam protection\n' +
                            '• Slow nuke detection'
                        }
                    )
                    .addFields(
                        { name: 'Action Limits', value: 
                            `• Role Creation: ${settings.role_creation_limit}\n` +
                            `• Role Deletion: ${settings.role_deletion_limit}\n` +
                            `• Channel Creation: ${settings.channel_creation_limit}\n` +
                            `• Channel Deletion: ${settings.channel_deletion_limit}\n` +
                            `• Emoji Creation: ${settings.emoji_creation_limit}\n` +
                            `• Emoji Deletion: ${settings.emoji_deletion_limit}\n` +
                            `• Webhook Creation: ${settings.webhook_creation_limit}\n` +
                            `• Ban Limit: ${settings.ban_limit}\n` +
                            `• Kick Limit: ${settings.kick_limit}`
                        },
                        { name: 'Spam Protection', value: 
                            `• Message Count: ${settings.spam_message_count}\n` +
                            `• Channel Count: ${settings.spam_channel_count}\n` +
                            `• Time Window: ${settings.spam_time_window/1000}s\n` +
                            `• Similarity Threshold: ${settings.spam_similarity_threshold*100}%`
                        },
                        { name: 'Slow Nuke Detection', value: 
                            `• Time Window: ${settings.slow_nuke_time_window/3600000}h\n` +
                            `• Action Threshold: ${settings.slow_nuke_action_threshold}\n` +
                            `• Bot Only: ${settings.slow_nuke_bot_only ? 'Yes' : 'No'}`
                        },
                        { name: 'Alert Settings', value: 
                            `• Alert Channel: ${settings.alert_channel ? `<#${settings.alert_channel}>` : 'Not set'}`
                        }
                    )
                    .setFooter({ text: 'Use !nukeprotection settings to configure' })
                    .setTimestamp();

                // Create action buttons
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('enable_protection')
                            .setLabel('Enable Protection')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('disable_protection')
                            .setLabel('Disable Protection')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('configure_alerts')
                            .setLabel('Configure Alerts')
                            .setStyle(ButtonStyle.Primary)
                    );

                const settingsMessage = await message.reply({ 
                    embeds: [embed],
                    components: [row]
                });

                // Create a collector for the buttons
                const collector = settingsMessage.createMessageComponentCollector({ 
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
                            case 'enable_protection':
                                await nukeProtection.enable(message.guild.id);
                                await interaction.reply({ 
                                    content: '✅ Nuke protection has been enabled for this server.',
                                    ephemeral: true 
                                });
                                break;
                            case 'disable_protection':
                                await nukeProtection.disable(message.guild.id);
                                await interaction.reply({ 
                                    content: '✅ Nuke protection has been disabled for this server.',
                                    ephemeral: true 
                                });
                                break;
                            case 'configure_alerts':
                                const alertRow = new ActionRowBuilder()
                                    .addComponents(
                                        new StringSelectMenuBuilder()
                                            .setCustomId('alert_settings')
                                            .setPlaceholder('Select alert settings to configure')
                                            .addOptions([
                                                {
                                                    label: 'Set Alert Channel',
                                                    description: 'Set the channel for nuke protection alerts',
                                                    value: 'set_channel'
                                                }
                                            ])
                                    );

                                // Edit the original settings message to include select
                                await settingsMessage.edit({ components: [row, alertRow] });
                                await interaction.reply({ content: 'Use the menu below to configure alerts.', ephemeral: true });
                                break;
                        }

                        // Handle select menu interactions
                        if (interaction.isStringSelectMenu && interaction.customId === 'alert_settings') {
                            const selected = interaction.values?.[0];
                            if (selected === 'set_channel') {
                                try {
                                    await db.updateNukeProtectionSettings(message.guild.id, { alert_channel: message.channel.id });
                                    // Update in-memory cache if present
                                    if (!nukeProtection.settings[message.guild.id]) {
                                        nukeProtection.settings[message.guild.id] = {};
                                    }
                                    nukeProtection.settings[message.guild.id].alertChannel = message.channel.id;

                                    await interaction.reply({ content: `✅ Alert channel set to ${message.channel}.`, ephemeral: true });

                                    // Refresh the embed
                                    const refreshed = await nukeProtection.getSettings(message.guild.id);
                                    const isEnabledNow = nukeProtection.isProtected(message.guild.id);
                                    const updatedEmbed = EmbedBuilder.from(embed)
                                        .setFields(
                                            { name: 'Status', value: isEnabledNow ? 'Enabled' : 'Disabled', inline: true },
                                            { name: 'Protected Actions', value: '• Mass role creation/deletion\n• Mass channel creation/deletion\n• Mass emoji creation/deletion\n• Mass webhook creation\n• Mass bans/kicks\n• Spam protection\n• Slow nuke detection' },
                                            { name: 'Action Limits', value: `• Role Creation: ${refreshed.role_creation_limit}\n• Role Deletion: ${refreshed.role_deletion_limit}\n• Channel Creation: ${refreshed.channel_creation_limit}\n• Channel Deletion: ${refreshed.channel_deletion_limit}\n• Emoji Creation: ${refreshed.emoji_creation_limit}\n• Emoji Deletion: ${refreshed.emoji_deletion_limit}\n• Webhook Creation: ${refreshed.webhook_creation_limit}\n• Ban Limit: ${refreshed.ban_limit}\n• Kick Limit: ${refreshed.kick_limit}` },
                                            { name: 'Spam Protection', value: `• Message Count: ${refreshed.spam_message_count}\n• Channel Count: ${refreshed.spam_channel_count}\n• Time Window: ${refreshed.spam_time_window/1000}s\n• Similarity Threshold: ${refreshed.spam_similarity_threshold*100}%` },
                                            { name: 'Slow Nuke Detection', value: `• Time Window: ${refreshed.slow_nuke_time_window/3600000}h\n• Action Threshold: ${refreshed.slow_nuke_action_threshold}\n• Bot Only: ${refreshed.slow_nuke_bot_only ? 'Yes' : 'No'}` },
                                            { name: 'Alert Settings', value: `• Alert Channel: ${refreshed.alert_channel ? `<#${refreshed.alert_channel}>` : 'Not set'}` }
                                        );
                                    await settingsMessage.edit({ embeds: [updatedEmbed] });
                                } catch (e) {
                                    console.error('Error setting alert channel:', e);
                                    await interaction.reply({ content: '❌ Failed to set alert channel.', ephemeral: true });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error handling button interaction:', error);
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
                                .setCustomId('enable_protection')
                                .setLabel('Enable Protection')
                                .setStyle(ButtonStyle.Success)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('disable_protection')
                                .setLabel('Disable Protection')
                                .setStyle(ButtonStyle.Danger)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('configure_alerts')
                                .setLabel('Configure Alerts')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                        );
                    settingsMessage.edit({ components: [disabledRow] }).catch(console.error);
                });

                return;
            }

            const action = args[0].toLowerCase();

            // Handle enable/disable
            if (action === 'enable' || action === 'disable') {
                let success = false;
                let status = '';

                try {
                    if (action === 'enable') {
                        success = await nukeProtection.enable(message.guild.id);
                        status = 'enabled';
                    } else {
                        success = await nukeProtection.disable(message.guild.id);
                        status = 'disabled';
                    }

                    if (success) {
                        const embed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('Nuke Protection')
                            .setDescription(`Nuke protection has been ${status} for this server.`)
                            .setFooter({ text: 'Server Protection' })
                            .setTimestamp();

                        await message.reply({ embeds: [embed] });

                        // Log the action
                        await db.logModerationAction(
                            message.author.id,
                            message.guild.id,
                            message.author.id,
                            'NUKE_PROTECTION',
                            `Nuke protection ${status}`
                        );
                    } else {
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Error')
                            .setDescription(`Failed to ${action} nuke protection. Please try again later.`)
                            .setFooter({ text: 'Server Protection' })
                            .setTimestamp();

                        await message.reply({ embeds: [embed] });
                    }
                } catch (error) {
                    console.error('Error in nukeprotection command:', error);
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('Error')
                        .setDescription('An error occurred while processing your request.')
                        .setFooter({ text: 'Server Protection' })
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });
                }
            }
            // Handle settings configuration
            else if (action === 'settings') {
                if (!args[1]) {
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Nuke Protection Settings')
                        .setDescription('Available settings to configure:')
                        .addFields(
                            { name: 'Action Limits', value: 
                                '• rolecreation <number> - Set role creation limit\n' +
                                '• roledeletion <number> - Set role deletion limit\n' +
                                '• channelcreation <number> - Set channel creation limit\n' +
                                '• channeldeletion <number> - Set channel deletion limit\n' +
                                '• emojicreation <number> - Set emoji creation limit\n' +
                                '• emojideletion <number> - Set emoji deletion limit\n' +
                                '• webhookcreation <number> - Set webhook creation limit\n' +
                                '• banlimit <number> - Set ban limit\n' +
                                '• kicklimit <number> - Set kick limit'
                            },
                            { name: 'Spam Protection', value: 
                                '• messagecount <number> - Set number of identical messages\n' +
                                '• channelcount <number> - Set number of different channels\n' +
                                '• timewindow <seconds> - Set time window in seconds\n' +
                                '• similarity <percentage> - Set similarity threshold'
                            },
                            { name: 'Slow Nuke Detection', value: 
                                '• slowtimewindow <hours> - Set slow nuke time window\n' +
                                '• slowthreshold <number> - Set slow nuke action threshold\n' +
                                '• slowbotonly <yes/no> - Toggle bot-only slow nuke detection'
                            },
                            { name: 'Alert', value: '• alertchannel - Set alerts to this channel' }
                        )
                        .setFooter({ text: 'Example: !nukeprotection settings rolecreation 5' })
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                }

                const setting = args[1].toLowerCase();
                const value = args[2];

                if (!value) {
                    return message.reply('Please provide a value for the setting.');
                }

                try {
                        const settings = await nukeProtection.getSettings(message.guild.id);
                    if (!settings) {
                        return message.reply('Error loading settings. Please try again later.');
                    }

                    const settingMap = {
                        // Action limits
                        'rolecreation': 'role_creation_limit',
                        'roledeletion': 'role_deletion_limit',
                        'channelcreation': 'channel_creation_limit',
                        'channeldeletion': 'channel_deletion_limit',
                        'emojicreation': 'emoji_creation_limit',
                        'emojideletion': 'emoji_deletion_limit',
                        'webhookcreation': 'webhook_creation_limit',
                        'banlimit': 'ban_limit',
                        'kicklimit': 'kick_limit',
                        // Spam protection
                        'messagecount': 'spam_message_count',
                        'channelcount': 'spam_channel_count',
                        'timewindow': 'spam_time_window',
                        'similarity': 'spam_similarity_threshold',
                        // Slow nuke detection
                        'slowtimewindow': 'slow_nuke_time_window',
                        'slowthreshold': 'slow_nuke_action_threshold',
                        'slowbotonly': 'slow_nuke_bot_only',
                        // Alert
                        'alertchannel': 'alert_channel'
                    };

                    const dbField = settingMap[setting];
                    if (!dbField) {
                        return message.reply('Invalid setting. Use !nukeprotection settings to see available options.');
                    }

                    // Special handling for different types of settings
                    if (setting === 'similarity') {
                        const numValue = parseFloat(value);
                        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
                            return message.reply('Similarity must be a number between 0 and 100.');
                        }
                        settings[dbField] = numValue / 100;
                    } else if (setting === 'alertchannel') {
                        // Set alert channel to current channel if no value provided, else validate channel mention/id
                        let channelId = value;
                        if (!channelId || channelId.toLowerCase() === 'here') {
                            channelId = message.channel.id;
                        } else {
                            const match = channelId.match(/^(?:<#)?(\d{17,20})>?$/);
                            if (!match) {
                                return message.reply('Please provide a valid channel mention or ID, or use "here".');
                            }
                            channelId = match[1];
                            const ch = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
                            if (!ch || !ch.isTextBased()) {
                                return message.reply('That channel is not a valid text channel in this server.');
                            }
                        }
                        settings[dbField] = channelId;
                    } else if (setting === 'timewindow' || setting === 'slowtimewindow') {
                        const numValue = parseInt(value);
                        if (isNaN(numValue) || numValue < 0) {
                            return message.reply('Time window must be a positive number.');
                        }
                        settings[dbField] = numValue * (setting === 'timewindow' ? 1000 : 3600000);
                    } else if (setting === 'slowbotonly') {
                        settings[dbField] = value.toLowerCase() === 'yes' ? 1 : 0;
                    } else {
                        const numValue = parseInt(value);
                        if (isNaN(numValue) || numValue < 0) {
                            return message.reply('Value must be a positive number.');
                        }
                        settings[dbField] = numValue;
                    }

                    const ok = await nukeProtection.updateSettings(message.guild.id, settings);
                    if (!ok) {
                        return message.reply('Failed to update settings.');
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('Settings Updated')
                        .setDescription(`Successfully updated ${setting} to ${setting === 'alertchannel' ? `<#${settings[dbField]}>` : value}`)
                        .setFooter({ text: 'Nuke Protection Settings' })
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });

                    // Log the action
                    await db.logModerationAction(
                        message.author.id,
                        message.guild.id,
                        message.author.id,
                        'NUKE_PROTECTION',
                        `Updated ${setting} to ${value}`
                    );
                } catch (error) {
                    console.error('Error updating settings:', error);
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('Error')
                        .setDescription('An error occurred while updating settings.')
                        .setFooter({ text: 'Server Protection' })
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });
                }
            }
            // Handle reset
            else if (action === 'reset') {
                try {
                    const settings = await nukeProtection.getSettings(message.guild.id);
                    if (!settings) {
                        return message.reply('Error loading settings. Please try again later.');
                    }

                    // Create confirmation buttons
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirm_reset')
                                .setLabel('Confirm Reset')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('cancel_reset')
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('Reset Confirmation')
                        .setDescription('Are you sure you want to reset all nuke protection settings to default values?')
                        .addFields(
                            { name: 'Current Settings', value: 
                                `• Role Creation: ${settings.role_creation_limit}\n` +
                                `• Role Deletion: ${settings.role_deletion_limit}\n` +
                                `• Channel Creation: ${settings.channel_creation_limit}\n` +
                                `• Channel Deletion: ${settings.channel_deletion_limit}\n` +
                                `• Emoji Creation: ${settings.emoji_creation_limit}\n` +
                                `• Emoji Deletion: ${settings.emoji_deletion_limit}\n` +
                                `• Webhook Creation: ${settings.webhook_creation_limit}\n` +
                                `• Ban Limit: ${settings.ban_limit}\n` +
                                `• Kick Limit: ${settings.kick_limit}`
                            },
                            { name: 'Default Settings', value: 
                                `• Role Creation: ${DEFAULT_SETTINGS.role_creation_limit}\n` +
                                `• Role Deletion: ${DEFAULT_SETTINGS.role_deletion_limit}\n` +
                                `• Channel Creation: ${DEFAULT_SETTINGS.channel_creation_limit}\n` +
                                `• Channel Deletion: ${DEFAULT_SETTINGS.channel_deletion_limit}\n` +
                                `• Emoji Creation: ${DEFAULT_SETTINGS.emoji_creation_limit}\n` +
                                `• Emoji Deletion: ${DEFAULT_SETTINGS.emoji_deletion_limit}\n` +
                                `• Webhook Creation: ${DEFAULT_SETTINGS.webhook_creation_limit}\n` +
                                `• Ban Limit: ${DEFAULT_SETTINGS.ban_limit}\n` +
                                `• Kick Limit: ${DEFAULT_SETTINGS.kick_limit}`
                            }
                        )
                        .setFooter({ text: 'This action cannot be undone' })
                        .setTimestamp();

                    const confirmationMessage = await message.reply({ 
                        embeds: [embed], 
                        components: [row] 
                    });

                    // Create a collector for the buttons
                    const collector = confirmationMessage.createMessageComponentCollector({ 
                        time: 30000, // 30 seconds timeout
                        filter: i => i.user.id === message.author.id 
                    });

                    collector.on('collect', async (interaction) => {
                        if (interaction.customId === 'confirm_reset') {
                            try {
                                // Reset to default settings
                                await nukeProtection.updateSettings(message.guild.id, DB_DEFAULTS);

                                const successEmbed = new EmbedBuilder()
                                    .setColor('#00FF00')
                                    .setTitle('Settings Reset')
                                    .setDescription('All nuke protection settings have been reset to default values.')
                                    .addFields(
                                        { name: 'Default Action Limits', value: 
                                            `• Role Creation: ${DB_DEFAULTS.role_creation_limit}\n` +
                                            `• Role Deletion: ${DB_DEFAULTS.role_deletion_limit}\n` +
                                            `• Channel Creation: ${DB_DEFAULTS.channel_creation_limit}\n` +
                                            `• Channel Deletion: ${DB_DEFAULTS.channel_deletion_limit}\n` +
                                            `• Emoji Creation: ${DB_DEFAULTS.emoji_creation_limit}\n` +
                                            `• Emoji Deletion: ${DB_DEFAULTS.emoji_deletion_limit}\n` +
                                            `• Webhook Creation: ${DB_DEFAULTS.webhook_creation_limit}\n` +
                                            `• Ban Limit: ${DB_DEFAULTS.ban_limit}\n` +
                                            `• Kick Limit: ${DB_DEFAULTS.kick_limit}`
                                        },
                                        { name: 'Default Spam Protection', value: 
                                            `• Message Count: ${DB_DEFAULTS.spam_message_count}\n` +
                                            `• Channel Count: ${DB_DEFAULTS.spam_channel_count}\n` +
                                            `• Time Window: ${DB_DEFAULTS.spam_time_window/1000}s\n` +
                                            `• Similarity Threshold: ${DB_DEFAULTS.spam_similarity_threshold*100}%`
                                        },
                                        { name: 'Default Slow Nuke Detection', value: 
                                            `• Time Window: ${DB_DEFAULTS.slow_nuke_time_window/3600000}h\n` +
                                            `• Action Threshold: ${DB_DEFAULTS.slow_nuke_action_threshold}\n` +
                                            `• Bot Only: ${DB_DEFAULTS.slow_nuke_bot_only ? 'Yes' : 'No'}`
                                        }
                                    )
                                    .setFooter({ text: 'Nuke Protection Settings' })
                                    .setTimestamp();

                                await interaction.update({ 
                                    embeds: [successEmbed],
                                    components: [] 
                                });

                                // Log the action
                                await db.logModerationAction(
                                    message.author.id,
                                    message.guild.id,
                                    message.author.id,
                                    'NUKE_PROTECTION',
                                    'Reset all settings to default'
                                );
                            } catch (error) {
                                console.error('Error resetting settings:', error);
                                const errorEmbed = new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('Error')
                                    .setDescription('An error occurred while resetting settings.')
                                    .setFooter({ text: 'Server Protection' })
                                    .setTimestamp();

                                await interaction.update({ 
                                    embeds: [errorEmbed],
                                    components: [] 
                                });
                            }
                        } else if (interaction.customId === 'cancel_reset') {
                            const cancelEmbed = new EmbedBuilder()
                                .setColor('#FFA500')
                                .setTitle('Reset Cancelled')
                                .setDescription('The reset operation has been cancelled.')
                                .setFooter({ text: 'Nuke Protection Settings' })
                                .setTimestamp();

                            await interaction.update({ 
                                embeds: [cancelEmbed],
                                components: [] 
                            });
                        }
                    });

                    collector.on('end', (collected, reason) => {
                        if (reason === 'time') {
                            const timeoutEmbed = new EmbedBuilder()
                                .setColor('#FFA500')
                                .setTitle('Reset Cancelled')
                                .setDescription('The reset operation timed out after 30 seconds.')
                                .setFooter({ text: 'Nuke Protection Settings' })
                                .setTimestamp();

                            confirmationMessage.edit({ 
                                embeds: [timeoutEmbed],
                                components: [] 
                            }).catch(console.error);
                        }
                    });
                } catch (error) {
                    console.error('Error in reset operation:', error);
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('Error')
                        .setDescription('An error occurred while processing the reset operation.')
                        .setFooter({ text: 'Server Protection' })
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });
                }
            }
            else {
                return message.reply('Invalid action. Use `enable`, `disable`, `settings`, or `reset`.');
            }
        } catch (error) {
            console.error('Error in nukeprotection command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Error')
                .setDescription('An error occurred while processing your request.')
                .setFooter({ text: 'Server Protection' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        }
    }
}; 