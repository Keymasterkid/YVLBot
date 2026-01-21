const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const config = require('../config');
const db = require('./database');

class CommandHandler {
    constructor() {
        this.commands = new Collection();
        this.slashCommands = new Collection();
        this.cooldowns = new Collection();
        console.log('CommandHandler initialized');
    }

    loadCommands() {
        const commandFolders = fs.readdirSync(path.join(__dirname, '../commands'));
        for (const folder of commandFolders) {
            const commandFiles = fs.readdirSync(path.join(__dirname, '../commands', folder))
                .filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const command = require(path.join(__dirname, '../commands', folder, file));
                command.category = folder;
                this.commands.set(command.name, command);
            }
        }

        const slashCommandFolders = fs.readdirSync(path.join(__dirname, '../slashcommands'));
        for (const folder of slashCommandFolders) {
            const slashCommandFiles = fs.readdirSync(path.join(__dirname, '../slashcommands', folder))
                .filter(file => file.endsWith('.js'));

            for (const file of slashCommandFiles) {
                const slashCommand = require(path.join(__dirname, '../slashcommands', folder, file));
                slashCommand.category = folder;
                this.slashCommands.set(slashCommand.data.name, slashCommand);
            }
        }
    }

    getSlashCommands() {
        return Array.from(this.slashCommands.values()).map(cmd => cmd.data.toJSON());
    }

    async handlePrefixCommand(message, commandName, args) {
        const command = this.commands.get(commandName) ||
            this.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return false;

        console.log(`[CommandHandler] Handling command: ${commandName}`);

        // Global blacklist check with owner bypass
        try {
            const userRow = await db.get(
                'SELECT is_blacklisted, is_owner FROM users WHERE id = ?',
                [message.author.id]
            );

            if (userRow) {
                // Owner auto-unblacklist
                if (userRow.is_owner === 1 && userRow.is_blacklisted === 1) {
                    await db.run(
                        'UPDATE users SET is_blacklisted = 0 WHERE id = ?',
                        [message.author.id]
                    );

                    await message.reply('Your blacklist has been removed automatically.');
                }

                // Normal blacklist block
                if (userRow.is_blacklisted === 1 && userRow.is_owner !== 1) {
                    await message.reply('You are blacklisted from using this bot.');
                    return true;
                }
            }
        } catch (blErr) {
            console.warn('[CommandHandler] Blacklist check failed (continuing):', blErr);
        }

        // Permission check
        try {
            if (command.permissions && command.permissions.length > 0) {
                const hasPermission = command.permissions.every(permission =>
                    message.member.permissions.has(permission)
                );
                if (!hasPermission) {
                    await message.reply('You do not have permission to use this command.');
                    return true;
                }
            }
        } catch (permErr) {
            console.warn('[CommandHandler] Permission check failed:', permErr);
        }

        // Cooldown system
        if (!this.cooldowns.has(command.name)) {
            this.cooldowns.set(command.name, new Collection());
        }

        const now = Date.now();
        const timestamps = this.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                await message.reply(`Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`);
                return true;
            }
        }

        timestamps.set(message.author.id, now);
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        try {
            console.log(`[CommandHandler] Executing command: ${command.name}`);
            const client = message.client;
            const prefix = config.prefix || '!';

            await command.execute(message, args, client, prefix, db);
            console.log(`[CommandHandler] Command executed successfully: ${command.name}`);
            return true;
        } catch (error) {
            console.error(`[CommandHandler] Error executing command ${commandName}:`, error.stack || error);
            await message.reply('There was an error executing that command.');
            return true;
        }
    }

    async handleSlashCommand(interaction) {
        if (!interaction.isCommand()) return false;

        const command = this.slashCommands.get(interaction.commandName);
        if (!command) return false;

        console.log(`[CommandHandler] Handling slash command: ${interaction.commandName}`);

        try {
            // Global blacklist check with owner bypass
            try {
                const userRow = await db.get(
                    'SELECT is_blacklisted, is_owner FROM users WHERE id = ?',
                    [interaction.user.id]
                );

                if (userRow) {
                    // Owner auto-unblacklist
                    if (userRow.is_owner === 1 && userRow.is_blacklisted === 1) {
                        await db.run(
                            'UPDATE users SET is_blacklisted = 0 WHERE id = ?',
                            [interaction.user.id]
                        );

                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content: 'Your blacklist has been removed automatically.',
                                ephemeral: true
                            });
                        }
                    }

                    // Normal blacklist block
                    if (userRow.is_blacklisted === 1 && userRow.is_owner !== 1) {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content: 'You are blacklisted from using this bot.',
                                ephemeral: true
                            });
                        }
                        return true;
                    }
                }
            } catch (blErr) {
                console.warn('[CommandHandler] Slash blacklist check failed (continuing):', blErr);
            }

            console.log(`[CommandHandler] Executing slash command: ${interaction.commandName}`);
            await command.execute(interaction, db);
            console.log(`[CommandHandler] Slash command executed successfully: ${interaction.commandName}`);
            return true;
        } catch (error) {
            console.error(`[CommandHandler] Error executing slash command ${interaction.commandName}:`, error.stack || error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error executing this command!',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: 'There was an error executing this command!'
                });
            }
            return true;
        }
    }
}

module.exports = new CommandHandler();
