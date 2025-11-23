const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.initializeTables = this.initializeTables.bind(this);
        this.close = this.close.bind(this);
    }

    async connect() {
        if (this.db) return;

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(config.database.path, (err) => {
                if (err) {
                    console.error('Error connecting to database:', err);
                    reject(err);
                } else {
                    console.log('Connected to the SQLite database');
                    resolve();
                }
            });
        });
    }

    async initializeTables() {
        try {
            await this.connect();

            // First, check if nuke_protection column exists
            try {
                await this.run('SELECT nuke_protection FROM servers LIMIT 1');
            } catch (error) {
                if (error.message.includes('no such column')) {
                    // Add the column if it doesn't exist
                    await this.run('ALTER TABLE servers ADD COLUMN nuke_protection INTEGER DEFAULT 0');
                    console.log('Added nuke_protection column to servers table');
                }
            }

            // Check if log_channel column exists
            try {
                await this.run('SELECT log_channel FROM servers LIMIT 1');
            } catch (error) {
                if (error.message.includes('no such column')) {
                    // Add the column if it doesn't exist
                    await this.run('ALTER TABLE servers ADD COLUMN log_channel TEXT');
                    console.log('Added log_channel column to servers table');
                }
            }

            // Check if last_message_time column exists in user_levels
            try {
                await this.run('SELECT last_message_time FROM user_levels LIMIT 1');
            } catch (error) {
                if (error.message.includes('no such column')) {
                    // Add the column if it doesn't exist
                    await this.run('ALTER TABLE user_levels ADD COLUMN last_message_time INTEGER');
                    console.log('Added last_message_time column to user_levels table');
                }
            }

            const tables = [
                `CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, 
                    username TEXT, 
                    is_admin INTEGER DEFAULT 0, 
                    is_owner INTEGER DEFAULT 0, 
                    is_blacklisted INTEGER DEFAULT 0,
                    created_at INTEGER DEFAULT (unixepoch())
                )`,
                `CREATE TABLE IF NOT EXISTS servers (
                    server_id TEXT PRIMARY KEY, 
                    owner_id TEXT, 
                    server_name TEXT, 
                    is_blacklisted INTEGER DEFAULT 0, 
                    is_premium INTEGER DEFAULT 0,
                    starboard_channel TEXT,
                    welcome_channel TEXT,
                    leave_channel TEXT,
                    nuke_protection INTEGER DEFAULT 0,
                    log_channel TEXT,
                    created_at INTEGER DEFAULT (unixepoch())
                )`,
                `CREATE TABLE IF NOT EXISTS command_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id TEXT,
                    name TEXT,
                    description TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch()),
                    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS user_levels (
                    user_id TEXT, 
                    server_id TEXT, 
                    level INTEGER DEFAULT 1, 
                    xp INTEGER DEFAULT 0,
                    last_message_time INTEGER,
                    PRIMARY KEY (user_id, server_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS vc_activity (
                    user_id TEXT, 
                    server_id TEXT, 
                    days INTEGER DEFAULT 0, 
                    hours INTEGER DEFAULT 0, 
                    minutes INTEGER DEFAULT 0,
                    last_join_time INTEGER,
                    PRIMARY KEY (user_id, server_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS access_keys (
                    id TEXT PRIMARY KEY, 
                    access_key TEXT,
                    created_at INTEGER DEFAULT (unixepoch()),
                    expires_at INTEGER
                )`,
                `CREATE TABLE IF NOT EXISTS warnings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    server_id TEXT,
                    moderator_id TEXT,
                    reason TEXT,
                    timestamp INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS moderation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    server_id TEXT,
                    moderator_id TEXT,
                    action TEXT,
                    reason TEXT,
                    timestamp INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS nuke_protection_settings (
                    server_id TEXT PRIMARY KEY,
                    enabled INTEGER DEFAULT 0,
                    role_creation_limit INTEGER DEFAULT 5,
                    role_deletion_limit INTEGER DEFAULT 5,
                    channel_creation_limit INTEGER DEFAULT 5,
                    channel_deletion_limit INTEGER DEFAULT 5,
                    emoji_creation_limit INTEGER DEFAULT 5,
                    emoji_deletion_limit INTEGER DEFAULT 5,
                    webhook_creation_limit INTEGER DEFAULT 5,
                    ban_limit INTEGER DEFAULT 5,
                    kick_limit INTEGER DEFAULT 5,
                    spam_message_count INTEGER DEFAULT 5,
                    spam_channel_count INTEGER DEFAULT 3,
                    spam_time_window INTEGER DEFAULT 10000,
                    spam_similarity_threshold REAL DEFAULT 0.8,
                    slow_nuke_time_window INTEGER DEFAULT 3600000,
                    slow_nuke_action_threshold INTEGER DEFAULT 10
                )`,
                `CREATE TABLE IF NOT EXISTS economy(
                    user_id TEXT,
                    server_id TEXT,
                    wallet INTEGER DEFAULT 0,
                    bank INTEGER DEFAULT 0,
                    last_daily INTEGER DEFAULT 0,
                    last_work INTEGER DEFAULT 0,
                    PRIMARY KEY(user_id, server_id),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS family(
                    user_id TEXT,
                    server_id TEXT,
                    partner_id TEXT,
                    children TEXT DEFAULT '[]',
                    parents TEXT DEFAULT '[]',
                    marriage_date INTEGER,
                    PRIMARY KEY(user_id, server_id),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS shop_items(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id TEXT,
                    name TEXT,
                    description TEXT,
                    price INTEGER,
                    role_id TEXT,
                    FOREIGN KEY(server_id) REFERENCES servers(server_id) ON DELETE CASCADE
                )`
            ];

            for (const table of tables) {
                await this.run(table);
            }

            console.log('Database tables initialized successfully');
        } catch (error) {
            console.error('Error initializing database tables:', error);
            throw error;
        }
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) {
                    console.error('Database error:', err);
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('Database error:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Database error:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async addUserIfNotExists(userId, username) {
        try {
            const user = await this.get('SELECT id FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.run('INSERT INTO users (id, username) VALUES (?, ?)', [userId, username]);
            }
        } catch (error) {
            console.error('Error adding user:', error);
            throw error;
        }
    }

    async addServerIfNotExists(serverId, ownerId, serverName) {
        try {
            const server = await this.get('SELECT server_id FROM servers WHERE server_id = ?', [serverId]);
            if (!server) {
                await this.run('INSERT INTO servers (server_id, owner_id, server_name) VALUES (?, ?, ?)',
                    [serverId, ownerId, serverName]);
            }
        } catch (error) {
            console.error('Error adding server:', error);
            throw error;
        }
    }

    async updateUserXP(userId, serverId, xp) {
        try {
            await this.run(`
                INSERT INTO user_levels(user_id, server_id, xp, last_message_time)
                    VALUES(?, ?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET xp = xp + ?, last_message_time = ?
                        `, [userId, serverId, xp, Date.now(), xp, Date.now()]);
        } catch (error) {
            console.error('Error updating user XP:', error);
            throw error;
        }
    }

    async getUserLevel(userId, serverId) {
        try {
            const result = await this.get(`
                SELECT level, xp 
                FROM user_levels 
                WHERE user_id = ? AND server_id = ?
                        `, [userId, serverId]);

            return result || { level: 1, xp: 0 };
        } catch (error) {
            console.error('Error getting user level:', error);
            throw error;
        }
    }

    async updateUserLevel(userId, serverId, level) {
        try {
            await this.run(`
                UPDATE user_levels 
                SET level = ?
                        WHERE user_id = ? AND server_id = ?
                            `, [level, userId, serverId]);
        } catch (error) {
            console.error('Error updating user level:', error);
            throw error;
        }
    }

    async getWarnings(userId, serverId) {
        try {
            return await this.all(`
                SELECT w.*, u.username as moderator_name
                FROM warnings w
                LEFT JOIN users u ON w.moderator_id = u.id
                WHERE w.user_id = ? AND w.server_id = ?
                        ORDER BY w.timestamp DESC
                            `, [userId, serverId]);
        } catch (error) {
            console.error('Error getting warnings:', error);
            throw error;
        }
    }

    async clearWarnings(userId, serverId) {
        try {
            await this.run(`
                DELETE FROM warnings
                WHERE user_id = ? AND server_id = ?
                        `, [userId, serverId]);
        } catch (error) {
            console.error('Error clearing warnings:', error);
            throw error;
        }
    }

    async addWarning(userId, serverId, moderatorId, reason) {
        try {
            await this.run(`
                INSERT INTO warnings(user_id, server_id, moderator_id, reason, timestamp)
                    VALUES(?, ?, ?, ?, ?)
                        `, [userId, serverId, moderatorId, reason, Date.now()]);
        } catch (error) {
            console.error('Error adding warning:', error);
            throw error;
        }
    }

    async logModerationAction(userId, serverId, moderatorId, action, reason) {
        try {
            await this.run(`
                INSERT INTO moderation_logs(user_id, server_id, moderator_id, action, reason, timestamp)
                    VALUES(?, ?, ?, ?, ?, ?)
                `, [userId, serverId, moderatorId, action, reason, Date.now()]);
        } catch (error) {
            console.error('Error logging moderation action:', error);
            throw error;
        }
    }

    async insertDefaultCommands(serverId) {
        const defaultCommands = [
            { name: 'ping', description: 'Check bot latency', enabled: 1 },
            { name: 'help', description: 'Show help menu', enabled: 1 },
            { name: 'kick', description: 'Kick a user', enabled: 1 },
            { name: 'ban', description: 'Ban a user', enabled: 1 },
            { name: 'warn', description: 'Warn a user', enabled: 1 },
            { name: 'warnings', description: 'View user warnings', enabled: 1 },
            { name: 'clearwarnings', description: 'Clear user warnings', enabled: 1 },
            { name: 'play', description: 'Play music', enabled: 1 },
            { name: 'stop', description: 'Stop music', enabled: 1 },
            { name: 'skip', description: 'Skip current track', enabled: 1 },
            { name: 'queue', description: 'Show music queue', enabled: 1 },
            { name: 'volume', description: 'Adjust music volume', enabled: 1 },
            { name: 'nukeprotection', description: 'Configure nuke protection settings', enabled: 1 },
            { name: 'balance', description: 'Check your balance', enabled: 1 },
            { name: 'work', description: 'Work to earn money', enabled: 1 },
            { name: 'shop', description: 'View and buy items', enabled: 1 },
            { name: 'pay', description: 'Transfer money', enabled: 1 },
            { name: 'daily', description: 'Claim daily reward', enabled: 1 },
            { name: 'baltop', description: 'View richest users', enabled: 1 },
            { name: 'marry', description: 'Propose to a user', enabled: 1 },
            { name: 'divorce', description: 'Divorce your partner', enabled: 1 },
            { name: 'adopt', description: 'Adopt a user', enabled: 1 },
            { name: 'disown', description: 'Disown a child', enabled: 1 },
            { name: 'familytree', description: 'View family tree', enabled: 1 }
        ];

        try {
            // Check if server exists in command_settings
            const existingCommands = await this.all(
                'SELECT name FROM command_settings WHERE server_id = ?',
                [serverId]
            );

            const existingCommandNames = existingCommands.map(cmd => cmd.name);

            // Insert only new commands
            for (const cmd of defaultCommands) {
                if (!existingCommandNames.includes(cmd.name)) {
                    await this.run(
                        'INSERT INTO command_settings (server_id, name, description, enabled) VALUES (?, ?, ?, ?)',
                        [serverId, cmd.name, cmd.description, cmd.enabled]
                    );
                }
            }
        } catch (error) {
            console.error('Error inserting default commands:', error);
            throw error;
        }
    }

    async addUserIfNotExists(userId, username) {
        try {
            const user = await this.get('SELECT id FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.run('INSERT INTO users (id, username) VALUES (?, ?)', [userId, username]);
            }
        } catch (error) {
            console.error('Error adding user:', error);
            throw error;
        }
    }

    async addServerIfNotExists(serverId, ownerId, serverName) {
        try {
            const server = await this.get('SELECT server_id FROM servers WHERE server_id = ?', [serverId]);
            if (!server) {
                await this.run('INSERT INTO servers (server_id, owner_id, server_name) VALUES (?, ?, ?)',
                    [serverId, ownerId, serverName]);

                // Add default shop items
                await this.addDefaultShopItems(serverId);
            }
        } catch (error) {
            console.error('Error adding server:', error);
            throw error;
        }
    }

    async addDefaultShopItems(serverId) {
        const defaultItems = [
            { name: 'Cookie', description: 'A delicious cookie', price: 10, role_id: null },
            { name: 'Ring', description: 'A shiny ring for marriage', price: 5000, role_id: null },
            { name: 'VIP', description: 'VIP Role', price: 10000, role_id: null }
        ];

        try {
            for (const item of defaultItems) {
                await this.addShopItem(serverId, item.name, item.description, item.price, item.role_id);
            }
        } catch (error) {
            console.error('Error adding default shop items:', error);
        }
    }

    async getAllServers() {
        try {
            return await this.all('SELECT * FROM servers');
        } catch (error) {
            console.error('Error getting all servers:', error);
            throw error;
        }
    }

    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                        reject(err);
                    } else {
                        console.log('Database connection closed');
                        this.db = null;
                        resolve();
                    }
                });
            });
        }
    }


    async updateVCTime(userId, serverId, secondsToAdd) {
        try {
            const current = await this.get(
                'SELECT days, hours, minutes FROM vc_activity WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );

            let totalMinutes = 0;
            if (current) {
                totalMinutes = (current.days * 24 * 60) + (current.hours * 60) + current.minutes;
            }

            const minutesToAdd = Math.floor(secondsToAdd / 60);
            if (minutesToAdd === 0) return;

            totalMinutes += minutesToAdd;

            const newDays = Math.floor(totalMinutes / (24 * 60));
            const remainingMinutesAfterDays = totalMinutes % (24 * 60);
            const newHours = Math.floor(remainingMinutesAfterDays / 60);
            const newMinutes = remainingMinutesAfterDays % 60;

            if (current) {
                await this.run(
                    'UPDATE vc_activity SET days = ?, hours = ?, minutes = ? WHERE user_id = ? AND server_id = ?',
                    [newDays, newHours, newMinutes, userId, serverId]
                );
            } else {
                await this.run(
                    'INSERT INTO vc_activity (user_id, server_id, days, hours, minutes, last_join_time) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, serverId, newDays, newHours, newMinutes, Date.now()]
                );
            }
        } catch (error) {
            console.error('Error updating VC time:', error);
            throw error;
        }
    }

    async updateVCLastJoin(userId, serverId) {
        try {
            const exists = await this.get('SELECT 1 FROM vc_activity WHERE user_id = ? AND server_id = ?', [userId, serverId]);
            if (exists) {
                await this.run('UPDATE vc_activity SET last_join_time = ? WHERE user_id = ? AND server_id = ?', [Date.now(), userId, serverId]);
            } else {
                await this.run(
                    'INSERT INTO vc_activity (user_id, server_id, days, hours, minutes, last_join_time) VALUES (?, ?, 0, 0, 0, ?)',
                    [userId, serverId, Date.now()]
                );
            }
        } catch (error) {
            console.error('Error updating VC last join:', error);
            throw error;
        }
    }

    async initializeNukeProtectionSettings(serverId) {
        try {
            console.log('Initializing nuke protection settings for server:', serverId);
            await this.run(
                'INSERT OR IGNORE INTO nuke_protection_settings (server_id) VALUES (?)',
                [serverId]
            );
            console.log('Settings initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing nuke protection settings:', error);
            return false;
        }
    }

    async updateLogChannel(serverId, channelId) {
        try {
            await this.run(
                'UPDATE servers SET log_channel = ? WHERE server_id = ?',
                [channelId, serverId]
            );
            return true;
        } catch (error) {
            console.error('Error updating log channel:', error);
            return false;
        }
    }

    async getLogChannel(serverId) {
        try {
            console.log('Getting log channel for server:', serverId);
            const result = await this.get(
                'SELECT log_channel FROM servers WHERE server_id = ?',
                [serverId]
            );
            console.log('Retrieved log channel result:', result);
            return result?.log_channel || null;
        } catch (error) {
            console.error('Error getting log channel:', error);
            return null;
        }
    }

    async updateNukeProtectionSettings(serverId, settings) {
        try {
            const columns = Object.keys(settings).map(key => {
                // Convert camelCase to snake_case for database columns
                return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()} `);
            });
            const values = Object.values(settings);

            const setClause = columns.map(col => `${col} = ?`).join(', ');

            await this.run(
                `UPDATE nuke_protection_settings SET ${setClause} WHERE server_id = ? `,
                [...values, serverId]
            );
            return true;
        } catch (error) {
            console.error('Error updating nuke protection settings:', error);
            return false;
        }
    }

    async getNukeProtectionSettings(serverId) {
        try {
            return await this.get(
                'SELECT * FROM nuke_protection_settings WHERE server_id = ?',
                [serverId]
            );
        } catch (error) {
            console.error('Error getting nuke protection settings:', error);
            return null;
        }
    }

    // Economy Methods
    async getEconomy(userId, serverId) {
        try {
            const result = await this.get(
                'SELECT * FROM economy WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );
            return result || { wallet: 0, bank: 0, last_daily: 0, last_work: 0 };
        } catch (error) {
            console.error('Error getting economy:', error);
            throw error;
        }
    }

    async updateBalance(userId, serverId, amount, type = 'wallet') {
        try {
            await this.run(`
                INSERT INTO economy(user_id, server_id, ${type})
                    VALUES(?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET ${type} = ${type} + ?
                        `, [userId, serverId, amount, amount]);
        } catch (error) {
            console.error('Error updating balance:', error);
            throw error;
        }
    }

    async updateDaily(userId, serverId) {
        try {
            await this.run(`
                INSERT INTO economy(user_id, server_id, last_daily)
                    VALUES(?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET last_daily = ?
                        `, [userId, serverId, Date.now(), Date.now()]);
        } catch (error) {
            console.error('Error updating daily:', error);
            throw error;
        }
    }

    async updateWork(userId, serverId) {
        try {
            await this.run(`
                INSERT INTO economy(user_id, server_id, last_work)
                    VALUES(?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET last_work = ?
                        `, [userId, serverId, Date.now(), Date.now()]);
        } catch (error) {
            console.error('Error updating work:', error);
            throw error;
        }
    }

    async getLeaderboard(serverId, limit = 10) {
        try {
            return await this.all(`
                SELECT e.*, u.username 
                FROM economy e
                LEFT JOIN users u ON e.user_id = u.id
                WHERE e.server_id = ?
                        ORDER BY(e.wallet + e.bank) DESC
                    LIMIT ?
                        `, [serverId, limit]);
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            throw error;
        }
    }

    // Family Methods
    async getFamily(userId, serverId) {
        try {
            const result = await this.get(
                'SELECT * FROM family WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );
            if (result) {
                result.children = JSON.parse(result.children || '[]');
                result.parents = JSON.parse(result.parents || '[]');
            }
            return result || { partner_id: null, children: [], parents: [], marriage_date: null };
        } catch (error) {
            console.error('Error getting family:', error);
            throw error;
        }
    }

    async updateFamily(userId, serverId, data) {
        try {
            const current = await this.getFamily(userId, serverId);
            const newData = { ...current, ...data };

            await this.run(`
                INSERT INTO family(user_id, server_id, partner_id, children, parents, marriage_date)
                    VALUES(?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, server_id)
                DO UPDATE SET partner_id = ?, children = ?, parents = ?, marriage_date = ?
                        `, [
                userId, serverId,
                newData.partner_id, JSON.stringify(newData.children), JSON.stringify(newData.parents), newData.marriage_date,
                newData.partner_id, JSON.stringify(newData.children), JSON.stringify(newData.parents), newData.marriage_date
            ]);
        } catch (error) {
            console.error('Error updating family:', error);
            throw error;
        }
    }

    // Shop Methods
    async getShopItems(serverId) {
        try {
            return await this.all('SELECT * FROM shop_items WHERE server_id = ?', [serverId]);
        } catch (error) {
            console.error('Error getting shop items:', error);
            throw error;
        }
    }

    async addShopItem(serverId, name, description, price, roleId) {
        try {
            await this.run(
                'INSERT INTO shop_items (server_id, name, description, price, role_id) VALUES (?, ?, ?, ?, ?)',
                [serverId, name, description, price, roleId]
            );
        } catch (error) {
            console.error('Error adding shop item:', error);
            throw error;
        }
    }

    async getShopItem(serverId, itemId) {
        try {
            return await this.get('SELECT * FROM shop_items WHERE server_id = ? AND id = ?', [serverId, itemId]);
            await this.run(
                'UPDATE servers SET log_channel = ? WHERE server_id = ?',
                [channelId, serverId]
            );
            return true;
        } catch (error) {
            console.error('Error updating log channel:', error);
            return false;
        }
    }

    async getLogChannel(serverId) {
        try {
            console.log('Getting log channel for server:', serverId);
            const result = await this.get(
                'SELECT log_channel FROM servers WHERE server_id = ?',
                [serverId]
            );
            console.log('Retrieved log channel result:', result);
            return result?.log_channel || null;
        } catch (error) {
            console.error('Error getting log channel:', error);
            return null;
        }
    }

    async updateNukeProtectionSettings(serverId, settings) {
        try {
            const columns = Object.keys(settings).map(key => {
                // Convert camelCase to snake_case for database columns
                return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()} `);
            });
            const values = Object.values(settings);

            const setClause = columns.map(col => `${col} = ?`).join(', ');

            await this.run(
                `UPDATE nuke_protection_settings SET ${setClause} WHERE server_id = ? `,
                [...values, serverId]
            );
            return true;
        } catch (error) {
            console.error('Error updating nuke protection settings:', error);
            return false;
        }
    }

    async getNukeProtectionSettings(serverId) {
        try {
            return await this.get(
                'SELECT * FROM nuke_protection_settings WHERE server_id = ?',
                [serverId]
            );
        } catch (error) {
            console.error('Error getting nuke protection settings:', error);
            return null;
        }
    }

    // Economy Methods
    async getEconomy(userId, serverId) {
        try {
            const result = await this.get(
                'SELECT * FROM economy WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );
            return result || { wallet: 0, bank: 0, last_daily: 0, last_work: 0 };
        } catch (error) {
            console.error('Error getting economy:', error);
            throw error;
        }
    }

    async updateBalance(userId, serverId, amount, type = 'wallet') {
        try {
            await this.run(`
                INSERT INTO economy(user_id, server_id, ${type})
                    VALUES(?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET ${type} = ${type} + ?
                        `, [userId, serverId, amount, amount]);
        } catch (error) {
            console.error('Error updating balance:', error);
            throw error;
        }
    }

    async updateDaily(userId, serverId) {
        try {
            await this.run(`
                INSERT INTO economy(user_id, server_id, last_daily)
                    VALUES(?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET last_daily = ?
                        `, [userId, serverId, Date.now(), Date.now()]);
        } catch (error) {
            console.error('Error updating daily:', error);
            throw error;
        }
    }

    async updateWork(userId, serverId) {
        try {
            await this.run(`
                INSERT INTO economy(user_id, server_id, last_work)
                    VALUES(?, ?, ?)
                ON CONFLICT(user_id, server_id) 
                DO UPDATE SET last_work = ?
                        `, [userId, serverId, Date.now(), Date.now()]);
        } catch (error) {
            console.error('Error updating work:', error);
            throw error;
        }
    }

    async getLeaderboard(serverId, limit = 10) {
        try {
            return await this.all(`
                SELECT e.*, u.username 
                FROM economy e
                LEFT JOIN users u ON e.user_id = u.id
                WHERE e.server_id = ?
                        ORDER BY(e.wallet + e.bank) DESC
                    LIMIT ?
                        `, [serverId, limit]);
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            throw error;
        }
    }

    // Family Methods
    async getFamily(userId, serverId) {
        try {
            const result = await this.get(
                'SELECT * FROM family WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );
            if (result) {
                result.children = JSON.parse(result.children || '[]');
                result.parents = JSON.parse(result.parents || '[]');
            }
            return result || { partner_id: null, children: [], parents: [], marriage_date: null };
        } catch (error) {
            console.error('Error getting family:', error);
            throw error;
        }
    }

    async updateFamily(userId, serverId, data) {
        try {
            const current = await this.getFamily(userId, serverId);
            const newData = { ...current, ...data };

            await this.run(`
                INSERT INTO family(user_id, server_id, partner_id, children, parents, marriage_date)
                    VALUES(?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, server_id)
                DO UPDATE SET partner_id = ?, children = ?, parents = ?, marriage_date = ?
                        `, [
                userId, serverId,
                newData.partner_id, JSON.stringify(newData.children), JSON.stringify(newData.parents), newData.marriage_date,
                newData.partner_id, JSON.stringify(newData.children), JSON.stringify(newData.parents), newData.marriage_date
            ]);
        } catch (error) {
            console.error('Error updating family:', error);
            throw error;
        }
    }

    // Shop Methods
    async getShopItems(serverId) {
        try {
            return await this.all('SELECT * FROM shop_items WHERE server_id = ?', [serverId]);
        } catch (error) {
            console.error('Error getting shop items:', error);
            throw error;
        }
    }

    async addShopItem(serverId, name, description, price, roleId) {
        try {
            await this.run(
                'INSERT INTO shop_items (server_id, name, description, price, role_id) VALUES (?, ?, ?, ?, ?)',
                [serverId, name, description, price, roleId]
            );
        } catch (error) {
            console.error('Error adding shop item:', error);
            throw error;
        }
    }

    async getShopItem(serverId, itemId) {
        try {
            return await this.get('SELECT * FROM shop_items WHERE server_id = ? AND id = ?', [serverId, itemId]);
        } catch (error) {
            console.error('Error getting shop item:', error);
            throw error;
        }
    }
    async updateRob(userId, serverId) {
        try {
            await this.run(`
                UPDATE economy 
                SET last_rob = ? 
                WHERE user_id = ? AND server_id = ?
            `, [Date.now(), userId, serverId]);
        } catch (error) {
            console.error('Error updating rob timestamp:', error);
            throw error;
        }
    }

    async updateBeg(userId, serverId) {
        try {
            await this.run(`
                UPDATE economy 
                SET last_beg = ? 
                WHERE user_id = ? AND server_id = ?
            `, [Date.now(), userId, serverId]);
        } catch (error) {
            console.error('Error updating beg timestamp:', error);
            throw error;
        }
    }
}

module.exports = new DatabaseManager();