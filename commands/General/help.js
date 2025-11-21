const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'help',
  description: 'Display information about available commands',
  usage: '!help [command]',
  async execute(message, args, client, prefix, db) {
    console.log('[HELP] Starting help command execution');

    // If a specific command is requested
    if (args[0]) {
      console.log(`[HELP] Looking for specific command: ${args[0]}`);
      const command = client.commands.get(args[0]) || 
        client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(args[0]));

      if (!command) {
        return message.reply('That command does not exist.');
      }

      // Check if user has permission to view this command
      if (command.category === 'BAdmin' || command.category === 'BOwner') {
        try {
          console.log(`[HELP] Checking permissions for ${message.author.tag} to view ${command.category} command`);
          
          // Use Promise-based db.get method
          const userData = await db.get('SELECT is_admin, is_owner FROM users WHERE id = ?', [message.author.id]);
          console.log(`[HELP] User permission data:`, userData);

          if (!userData) {
            return message.reply('You do not have permission to view this command.');
          }
          if (command.category === 'BAdmin' && !userData.is_admin) {
            return message.reply('You do not have permission to view this command.');
          }
          if (command.category === 'BOwner' && !userData.is_owner) {
            return message.reply('You do not have permission to view this command.');
          }
        } catch (error) {
          console.error('[HELP] Error checking user permissions:', error);
          return message.reply('There was an error checking your permissions.');
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Command: ${command.name}`)
        .addFields(
          { name: 'Description', value: command.description || 'No description available' },
          { name: 'Usage', value: `\`${command.usage || `${prefix}${command.name}`}\`` },
          { name: 'Permissions', value: command.permissions ? command.permissions.join(', ') : 'None required' },
          { name: 'Category', value: command.category || 'General' }
        )
        .setFooter({ text: 'Bot Help System' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // Get user permissions
    let isAdmin = false;
    let isOwner = false;
    try {
      console.log(`[HELP] Fetching permissions for user ${message.author.id}`);
      
      // Use Promise-based db.get method
      const userData = await db.get('SELECT is_admin, is_owner FROM users WHERE id = ?', [message.author.id]);
      console.log(`[HELP] User permissions data:`, userData);
      
      isAdmin = userData?.is_admin === 1;
      isOwner = userData?.is_owner === 1;
    } catch (error) {
      console.error('[HELP] Error fetching user permissions:', error);
      // Continue with default permissions (false)
    }

    // Scan command directories and build categories
    const categories = {};
    const commandFolders = fs.readdirSync('./commands');
    console.log(`[HELP] Found command folders:`, commandFolders);

    for (const folder of commandFolders) {
      const commandFiles = fs.readdirSync(`./commands/${folder}`)
        .filter(file => file.endsWith('.js'));

      // Initialize category if it doesn't exist
      if (!categories[folder]) {
        categories[folder] = [];
      }

      // Add commands to their respective categories
      for (const file of commandFiles) {
        const commandName = file.slice(0, -3);
        const command = client.commands.get(commandName);
        if (command) {
          // Skip BAdmin and BOwner commands if user doesn't have permission
          if (folder === 'BAdmin' && !isAdmin) continue;
          if (folder === 'BOwner' && !isOwner) continue;
          
          categories[folder].push(command);
        } else {
          console.log(`[HELP] Command not found in client.commands: ${commandName}`);
        }
      }
    }

    // Only show categories that have commands
    const activeCategories = Object.entries(categories)
      .filter(([_, cmds]) => cmds.length > 0)
      .map(([name]) => name);
    
    console.log(`[HELP] Active categories:`, activeCategories);

    // Create buttons and split them into rows of max 5 buttons
    const buttonRows = [];
    let currentRow = new ActionRowBuilder();
    
    activeCategories.forEach((category, index) => {
      const button = new ButtonBuilder()
        .setCustomId(category)
        .setLabel(category)
        .setStyle(category === 'BAdmin' || category === 'BOwner' ? ButtonStyle.Danger : ButtonStyle.Primary);

      currentRow.addComponents(button);

      // If we've added 5 buttons or this is the last category, add the row
      if (currentRow.components.length === 5 || index === activeCategories.length - 1) {
        buttonRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
    });

    // Create the initial help embed
    const helpEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Bot Commands')
      .setDescription('Click on a category button to view commands in that category.')
      .setFooter({ text: 'Bot Help System' })
      .setTimestamp();

    // Send the initial message with buttons
    const helpMessage = await message.reply({
      embeds: [helpEmbed],
      components: buttonRows
    });

    // Create a collector for button interactions
    const collector = helpMessage.createMessageComponentCollector({
      time: 300000 // 5 minutes
    });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: 'This help menu is not for you!',
          ephemeral: true
        });
      }

      const category = interaction.customId;
      const commands = categories[category];

      const categoryEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${category} Commands`)
        .setDescription(commands.map(cmd => 
          `**${prefix}${cmd.name}** - ${cmd.description || 'No description available'}`
        ).join('\n'))
        .setFooter({ text: 'Bot Help System' })
        .setTimestamp();

      await interaction.update({ embeds: [categoryEmbed] });
    });

    collector.on('end', () => {
      // Disable all buttons when the collector ends
      const disabledRows = buttonRows.map(row => {
        const disabledComponents = row.components.map(button => 
          ButtonBuilder.from(button.data).setDisabled(true)
        );
        return new ActionRowBuilder().addComponents(disabledComponents);
      });

      helpMessage.edit({
        components: disabledRows
      }).catch(console.error);
    });
  }
};
