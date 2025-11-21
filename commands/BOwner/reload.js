const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'reload',
  description: 'Reloads a command or all commands. (Bot owner only)',
  async execute(message, args, client, prefix, db) {
    const userId = message.author.id;
    console.log(`[RELOAD] User ${message.author.tag} (${userId}) attempting to use reload command`);

    try {
      // Check if the user is the bot owner
      if (!db) {
        console.error('[RELOAD] Database object is undefined or null');
        return message.reply('There was an error accessing the database. Please try again later.');
      }

      let isOwner;
      try {
        const row = await db.get('SELECT is_owner FROM users WHERE id = ?', [userId]);
        console.log(`[RELOAD] Owner check query result:`, row);
        isOwner = row ? row.is_owner : 0;
      } catch (dbError) {
        console.error('[RELOAD] Error checking owner status:', dbError);
        return message.reply('There was an error checking your permissions. Please try again later.');
      }

      console.log(`[RELOAD] User ${message.author.tag} is_owner=${isOwner}`);

      if (!isOwner) {
        console.log(`[RELOAD] Access denied for ${message.author.tag} - not an owner`);
        return message.reply('You must be the bot owner to use this command.');
      }

      if (!args.length) {
        return message.reply('Please provide the name of the command you want to reload, or type "all" to reload all commands.');
      }

      const commandName = args[0].toLowerCase();
      const commandsDir = path.join(__dirname, '..'); // Directory path to commands folder
      console.log(`[RELOAD] Command directory: ${commandsDir}`);

      // 🔹 Reload all commands
      if (commandName === 'all') {
        console.log(`[RELOAD] Attempting to reload all commands`);
        const commandFolders = fs.readdirSync(commandsDir);
        let reloadedCount = 0;

        for (const folder of commandFolders) {
          const folderPath = path.join(commandsDir, folder);
          if (!fs.statSync(folderPath).isDirectory()) continue; // Skip non-folders
          console.log(`[RELOAD] Processing folder: ${folder}`);

          const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

          for (const file of commandFiles) {
            try {
              const commandPath = path.join(folderPath, file);
              delete require.cache[require.resolve(commandPath)];
              const newCommand = require(commandPath);
              newCommand.category = folder;
              client.commands.set(newCommand.name, newCommand);
              reloadedCount++;
              console.log(`[RELOAD] Successfully reloaded: ${folder}/${file}`);
            } catch (error) {
              console.error(`[RELOAD] Failed to reload ${folder}/${file}:`, error);
            }
          }
        }
        
        console.log(`[RELOAD] Successfully reloaded ${reloadedCount} commands`);
        return message.reply(`All commands have been reloaded successfully! (${reloadedCount} commands)`);
      }

      // 🔹 Reload a specific command by searching all category folders
      console.log(`[RELOAD] Attempting to reload specific command: ${commandName}`);
      let found = false;

      for (const folder of fs.readdirSync(commandsDir)) {
        const folderPath = path.join(commandsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue; // Skip non-folders
        
        const commandPath = path.join(commandsDir, folder, `${commandName}.js`);
        if (fs.existsSync(commandPath)) {
          try {
            delete require.cache[require.resolve(commandPath)];
            const newCommand = require(commandPath);

            if (!newCommand.name) {
              console.log(`[RELOAD] Command ${commandName} has no name property and was removed`);
              client.commands.delete(commandName);
              return message.reply(`Command \`${commandName}\` no longer exists and was removed.`);
            }

            newCommand.category = folder;
            client.commands.set(newCommand.name, newCommand);
            found = true;
            console.log(`[RELOAD] Successfully reloaded command: ${commandName} in ${folder}`);
            return message.reply(`The command \`${commandName}\` has been reloaded successfully!`);
          } catch (error) {
            console.error(`[RELOAD] Error reloading command ${commandName}:`, error);
            return message.reply(`There was an error reloading command \`${commandName}\`: ${error.message}`);
          }
        }
      }

      if (!found) {
        console.log(`[RELOAD] Command not found: ${commandName}`);
        return message.reply(`There is no command with the name \`${commandName}\`!`);
      }
    } catch (error) {
      console.error('[RELOAD] Unexpected error during reload command:', error);
      return message.reply(`There was an error while reloading: ${error.message}`);
    }
  },
};
