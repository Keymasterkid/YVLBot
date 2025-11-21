const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../../config');

module.exports = {
  name: 'database',
  description: 'Manage database backups, restores, and merges',
  async execute(message, args, client, prefix, db) {
    const userId = message.author.id;
    console.log(`[DATABASE] User ${message.author.tag} (${userId}) attempting to use database command`);

    try {
      // Check if the user is the bot owner
      if (!db) {
        console.error('[DATABASE] Database object is undefined or null');
        return message.reply('There was an error accessing the database. Please try again later.');
      }

      let isOwner;
      try {
        const row = await db.get('SELECT is_owner FROM users WHERE id = ?', [userId]);
        console.log(`[DATABASE] Owner check query result:`, row);
        isOwner = row ? row.is_owner : 0;
      } catch (dbError) {
        console.error('[DATABASE] Error checking owner status:', dbError);
        return message.reply('There was an error checking your permissions. Please try again later.');
      }

      if (!isOwner) {
        console.log(`[DATABASE] Access denied for ${message.author.tag} - not an owner`);
        return message.reply('You must be the bot owner to use this command.');
      }

      if (!args.length) {
        return message.reply(
          'Please provide a subcommand:\n' +
          '`backup` - Create a new database backup\n' +
          '`list` - List all available backups\n' +
          '`restore <backup_name>` - Restore from a specific backup\n' +
          '`merge <backup1> <backup2>` - Merge two backups together\n' +
          '`override <backup_name> <table1> [table2] [table3] ...` - Override specific tables from backup\n' +
          '`tables <backup_name>` - List all tables in a backup'
        );
      }

      const subcommand = args[0].toLowerCase();
      const backupDir = path.join(__dirname, '..', '..', 'Database Backup');
      const dbPath = path.join(__dirname, '..', '..', config.database.path);

      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      switch (subcommand) {
        case 'backup': {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
          
          try {
            // Create a backup by copying the database file
            fs.copyFileSync(dbPath, backupPath);
            console.log(`[DATABASE] Created backup at ${backupPath}`);
            return message.reply(`Database backup created successfully: \`backup-${timestamp}.db\``);
          } catch (error) {
            console.error('[DATABASE] Backup error:', error);
            return message.reply(`Failed to create backup: ${error.message}`);
          }
        }

        case 'list': {
          try {
            const backups = fs.readdirSync(backupDir)
              .filter(file => file.endsWith('.db'))
              .sort((a, b) => {
                const statA = fs.statSync(path.join(backupDir, a));
                const statB = fs.statSync(path.join(backupDir, b));
                return statB.mtime - statA.mtime;
              });

            if (backups.length === 0) {
              return message.reply('No backups found.');
            }

            const backupList = backups.map((backup, index) => {
              const stats = fs.statSync(path.join(backupDir, backup));
              const size = (stats.size / 1024 / 1024).toFixed(2);
              return `${index + 1}. ${backup} (${size} MB)`;
            }).join('\n');

            return message.reply(`Available backups:\n\`\`\`\n${backupList}\n\`\`\``);
          } catch (error) {
            console.error('[DATABASE] List error:', error);
            return message.reply(`Failed to list backups: ${error.message}`);
          }
        }

        case 'tables': {
          try {
            let tables;
            let sourceName;

            if (args.length < 2) {
              // Show tables from current database
              tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
              sourceName = 'current database';
            } else {
              // Show tables from specified backup
              const backupName = args[1];
              const backupPath = path.join(backupDir, backupName);

              if (!fs.existsSync(backupPath)) {
                return message.reply(`Backup \`${backupName}\` not found.`);
              }

              const backupDb = new (require('sqlite3').verbose()).Database(backupPath);
              tables = await new Promise((resolve, reject) => {
                backupDb.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });
              backupDb.close();
              sourceName = `backup \`${backupName}\``;
            }

            if (tables.length === 0) {
              return message.reply(`No tables found in the ${sourceName}.`);
            }

            const tableList = tables.map((table, index) => {
              return `${index + 1}. ${table.name}`;
            }).join('\n');

            return message.reply(`Tables in ${sourceName}:\n\`\`\`\n${tableList}\n\`\`\``);
          } catch (error) {
            console.error('[DATABASE] Tables error:', error);
            return message.reply(`Failed to list tables: ${error.message}`);
          }
        }

        case 'override': {
          if (args.length < 3) {
            return message.reply('Please specify a backup name and at least one table to override.');
          }

          const backupName = args[1];
          const tablesToOverride = args.slice(2);
          const backupPath = path.join(backupDir, backupName);

          if (!fs.existsSync(backupPath)) {
            return message.reply(`Backup \`${backupName}\` not found.`);
          }

          try {
            // Create a temporary backup of current database
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tempBackup = path.join(backupDir, `pre-override-${timestamp}.db`);
            fs.copyFileSync(dbPath, tempBackup);

            // Open backup database
            const backupDb = new (require('sqlite3').verbose()).Database(backupPath);

            // Verify tables exist in backup
            const backupTables = await new Promise((resolve, reject) => {
              backupDb.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(t => t.name));
              });
            });

            const invalidTables = tablesToOverride.filter(table => !backupTables.includes(table));
            if (invalidTables.length > 0) {
              backupDb.close();
              return message.reply(`The following tables were not found in the backup: ${invalidTables.join(', ')}`);
            }

            // Begin transaction
            await db.run('BEGIN TRANSACTION');

            try {
              // Override each table
              for (const table of tablesToOverride) {
                // Clear current table
                await db.run(`DELETE FROM ${table}`);

                // Get all data from backup table
                const rows = await new Promise((resolve, reject) => {
                  backupDb.all(`SELECT * FROM ${table}`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                  });
                });

                // Insert data into current table
                for (const row of rows) {
                  const columns = Object.keys(row);
                  const placeholders = columns.map(() => '?').join(', ');
                  const values = Object.values(row);
                  await db.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
                }

                console.log(`[DATABASE] Overridden table: ${table}`);
              }

              // Commit transaction
              await db.run('COMMIT');
              backupDb.close();

              console.log(`[DATABASE] Override completed from backup: ${backupName}`);
              return message.reply(
                `Successfully overrode the following tables from backup \`${backupName}\`: ${tablesToOverride.join(', ')}\n` +
                `A backup of the previous state was created as \`pre-override-${timestamp}.db\``
              );
            } catch (error) {
              // Rollback on error
              await db.run('ROLLBACK');
              backupDb.close();
              throw error;
            }
          } catch (error) {
            console.error('[DATABASE] Override error:', error);
            return message.reply(`Failed to override tables: ${error.message}`);
          }
        }

        case 'restore': {
          if (args.length < 2) {
            return message.reply('Please specify a backup name to restore from.');
          }

          const backupName = args[1];
          const backupPath = path.join(backupDir, backupName);

          if (!fs.existsSync(backupPath)) {
            return message.reply(`Backup \`${backupName}\` not found.`);
          }

          try {
            // Create a temporary backup of current database
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tempBackup = path.join(backupDir, `pre-restore-${timestamp}.db`);
            fs.copyFileSync(dbPath, tempBackup);

            // Close the database connection
            await db.close();

            // Restore from the selected backup
            fs.copyFileSync(backupPath, dbPath);

            // Reopen the database
            await db.connect();

            console.log(`[DATABASE] Restored from backup: ${backupName}`);
            return message.reply(`Database restored from backup \`${backupName}\` successfully. A backup of the previous state was created as \`pre-restore-${timestamp}.db\``);
          } catch (error) {
            console.error('[DATABASE] Restore error:', error);
            return message.reply(`Failed to restore backup: ${error.message}`);
          }
        }

        case 'merge': {
          if (args.length < 3) {
            return message.reply('Please specify two backup names to merge.');
          }

          const backup1 = args[1];
          const backup2 = args[2];
          const backup1Path = path.join(backupDir, backup1);
          const backup2Path = path.join(backupDir, backup2);

          if (!fs.existsSync(backup1Path) || !fs.existsSync(backup2Path)) {
            return message.reply('One or both backup files not found.');
          }

          try {
            // Create a temporary database for merging
            const tempDbPath = path.join(backupDir, 'temp_merge.db');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const mergedBackup = path.join(backupDir, `merged-${timestamp}.db`);

            // Copy first backup to temp database
            fs.copyFileSync(backup1Path, tempDbPath);

            // Open temporary database
            const tempDb = new (require('sqlite3').verbose()).Database(tempDbPath);

            // Get all tables from second backup
            const backup2Db = new (require('sqlite3').verbose()).Database(backup2Path);
            const tables = await new Promise((resolve, reject) => {
              backup2Db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              });
            });

            // Merge each table
            for (const table of tables) {
              const tableName = table.name;
              if (tableName === 'sqlite_sequence') continue;

              // Get all data from second backup's table
              const rows = await new Promise((resolve, reject) => {
                backup2Db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });

              // Insert or update data in temp database
              for (const row of rows) {
                const columns = Object.keys(row);
                const placeholders = columns.map(() => '?').join(', ');
                const values = Object.values(row);

                // Try to insert, if fails (due to unique constraint), update
                try {
                  await new Promise((resolve, reject) => {
                    tempDb.run(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`, values, (err) => {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                } catch (error) {
                  // If insert fails, try update
                  const updateSet = columns.map(col => `${col} = ?`).join(', ');
                  const whereClause = columns.map(col => `${col} = ?`).join(' AND ');
                  await new Promise((resolve, reject) => {
                    tempDb.run(`UPDATE ${tableName} SET ${updateSet} WHERE ${whereClause}`, [...values, ...values], (err) => {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                }
              }
            }

            // Close databases
            await new Promise((resolve) => backup2Db.close(resolve));
            await new Promise((resolve) => tempDb.close(resolve));

            // Create final merged backup
            fs.copyFileSync(tempDbPath, mergedBackup);
            fs.unlinkSync(tempDbPath);

            console.log(`[DATABASE] Merged backups into: ${mergedBackup}`);
            return message.reply(`Successfully merged backups into \`merged-${timestamp}.db\``);
          } catch (error) {
            console.error('[DATABASE] Merge error:', error);
            return message.reply(`Failed to merge backups: ${error.message}`);
          }
        }

        default:
          return message.reply('Invalid subcommand. Use `backup`, `list`, `restore`, `merge`, `override`, or `tables`.');
      }
    } catch (error) {
      console.error('[DATABASE] Unexpected error:', error);
      return message.reply(`An unexpected error occurred: ${error.message}`);
    }
  },
}; 