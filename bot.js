const { Client, Events, GatewayIntentBits, Partials, Collection, EmbedBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // Using SQLite for local database
const config = require('./config');
const db = require('./utils/database');
const commandHandler = require('./utils/commandHandler');
const VCTracking = require('./VC_tracking');
const logStuff = require('./log_stuff');
const MemberJoin = require('./events/Memberjoin.js');
const starboardEvent = require('./events/starboardEvent.js');
const nukeProtection = require('./utils/nukeProtection');

// Create a client instance with the correct intents
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, // If you need to access message content
    GatewayIntentBits.GuildPresences, // If you need presence updates
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});

// Bot prefix
const prefix = config.prefix || '!';

// Create collections for commands and cooldowns
client.commands = new Collection();
client.slashCommands = new Collection();
client.cooldowns = new Collection();

// Error handling function
function handleError(error, context) {
  console.error(`Error in ${context}:`, error);
  // You can add additional error handling here, like sending to a logging channel
}

// Function to start the bot
async function startBot() {
  try {
    // Initialize database
    await db.initializeTables();
    console.log('Database initialized successfully');

    // Load commands
    await loadCommands();
    console.log('Commands loaded successfully');

    // Register slash commands
    await registerSlashCommands();
    console.log('Slash commands registered successfully');

    // Set up event listeners
    setupEventListeners();

    // Log in to Discord
    await client.login(config.token);
  } catch (error) {
    handleError(error, 'startBot');
    process.exit(1);
  }
}

// Load commands from directories
async function loadCommands() {
  try {
    // Load commands from each folder
    const commandFolders = fs.readdirSync('./commands');
    for (const folder of commandFolders) {
        console.log(`Loading commands from folder: ${folder}`);
        const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            console.log(`Loading command file: ${file}`);
            const command = require(`./commands/${folder}/${file}`);
            console.log(`Loaded command: ${command.name} from ${folder}/${file}`);
            client.commands.set(command.name, command);
        }
    }

    // Load slash commands
    const slashCommandFolders = fs.readdirSync(path.join(__dirname, 'slashcommands'));
    for (const folder of slashCommandFolders) {
      const slashCommandFiles = fs.readdirSync(path.join(__dirname, 'slashcommands', folder))
        .filter(file => file.endsWith('.js'));

      for (const file of slashCommandFiles) {
        const slashCommand = require(path.join(__dirname, 'slashcommands', folder, file));
        slashCommand.category = folder;
        client.slashCommands.set(slashCommand.data.name, slashCommand);
      }
    }
  } catch (error) {
    handleError(error, 'loadCommands');
    throw error;
  }
}

// Register slash commands with Discord
async function registerSlashCommands() {
  try {
    if (!config.token) {
      throw new Error('Bot token is not configured');
    }

    const rest = new REST({ version: '10' }).setToken(config.token);
    
    // Get all slash commands
    const slashCommands = Array.from(client.slashCommands.values())
      .map(cmd => cmd.data.toJSON());

    // Register commands globally
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: slashCommands }
    );

    console.log('Successfully registered slash commands globally');
  } catch (error) {
    console.error('Error registering slash commands:', error);
    throw error;
  }
}

// Set up event listeners
function setupEventListeners() {
  // Ready event
  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Health check and status logging
    console.log('=== Bot Health Check ===');
    console.log(`Guilds: ${client.guilds.cache.size}`);
    console.log(`Commands loaded: ${client.commands.size}`);
    console.log(`Slash commands loaded: ${client.slashCommands.size}`);
    console.log(`Prefix: ${prefix}`);
    console.log(`Database: ${db ? 'Connected' : 'Not connected'}`);
    console.log(`Token: ${config.token ? 'Set' : 'Missing'}`);
    console.log(`Client ID: ${config.clientId ? 'Set' : 'Missing'}`);
    console.log('========================');
    
    // Warn about missing critical config
    if (!config.token) {
      console.warn('⚠️  WARNING: Bot token is missing from config!');
    }
    if (!config.clientId) {
      console.warn('⚠️  WARNING: Client ID is missing from config!');
    }
    if (!db) {
      console.warn('⚠️  WARNING: Database connection failed!');
    }
    
    // Initialize server data
    for (const guild of client.guilds.cache.values()) {
      try {
        await db.addServerIfNotExists(guild.id, guild.ownerId, guild.name);
        // Initialize default commands for each server
        await db.insertDefaultCommands(guild.id);
        // Initialize nuke protection settings
        await db.initializeNukeProtectionSettings(guild.id);
      } catch (error) {
        console.error(`Error initializing server ${guild.name}:`, error);
      }
    }

    // Initialize modules
    try {
      console.log('Starting module initialization...');
      
      // Start auto status updater
      const changeStatusModule = require('./commands/BAdmin/change_status');
      changeStatusModule.startAutoStatus(client);
      console.log('✅ Auto status updater started');
      
      // Start VC tracking
      VCTracking(client, db);
      console.log('✅ VC tracking initialized');
      
      // Initialize nuke protection BEFORE registering log/event listeners
      console.log('Initializing nuke protection...');
      const success = await nukeProtection.initialize();
      console.log(`✅ Nuke protection initialized: ${success}`);
      
      // Initialize logging and events
      await logStuff(client, db);
      console.log('✅ Logging system initialized');
      
      MemberJoin(client, db);
      console.log('✅ Member join events initialized');
      
      starboardEvent(client, db);
      console.log('✅ Starboard events initialized');
      
      console.log('✅ All modules initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing modules:', error);
    }
  });

  // Message event
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    try {
      // Add user to database
      await db.addUserIfNotExists(message.author.id, message.author.username);

      // Check for spam
      await nukeProtection.handleSpam(message);

      // Handle prefix commands
      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Debug logging
        console.log('Command requested:', commandName);

        // Try using the commandHandler first
        try {
          // Set up commandHandler with current client collections if needed
          if (commandHandler.commands.size === 0) {
            console.log('Initializing commandHandler with loaded commands');
            commandHandler.commands = client.commands;
            commandHandler.slashCommands = client.slashCommands;
          }
          
          const handled = await commandHandler.handlePrefixCommand(message, commandName, args);
          if (handled) {
            console.log(`Command ${commandName} handled by commandHandler`);
            return; // Command was handled by the handler
          }
        } catch (handlerError) {
          console.error(`Error using commandHandler for ${commandName}:`, handlerError);
          // Fall back to the direct execution method below
        }

        // Fall back to direct command execution
        console.log('Available commands:', Array.from(client.commands.keys()));
        const command = client.commands.get(commandName) || 
          client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        // Debug logging
        console.log('Command found:', command ? command.name : 'null');
        if (command) {
            console.log('Command details:', {
                name: command.name,
                description: command.description,
                permissions: command.permissions
            });
        }

        if (command) {
            try {
                // Check permissions if required
                if (command.permissions && command.permissions.length > 0) {
                    console.log('Checking permissions:', command.permissions);
                    const hasPermission = command.permissions.every(permission =>
                        message.member.permissions.has(permission)
                    );
                    if (!hasPermission) {
                        console.log('Permission check failed');
                        return message.reply('You do not have permission to use this command.');
                    }
                    console.log('Permission check passed');
                }

                // Execute command
                console.log('Executing command:', command.name);
                // IMPORTANT: Fix parameter order to match what commands expect
                await command.execute(message, args, client, prefix, db);
                console.log('Command execution completed');
            } catch (error) {
                console.error('Error executing command:', error.stack || error);
                message.reply('There was an error executing that command.');
            }
        } else {
          console.log('Command not found:', commandName);
        }
      }

      // Handle XP gain
      await handleXpGain(message);
    } catch (error) {
      console.error('Error in message event:', error.stack || error);
    }
  });

  // Interaction event
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    try {
      // Try using the commandHandler first
      try {
        if (commandHandler.slashCommands.size === 0) {
          console.log('Initializing commandHandler with loaded slash commands');
          commandHandler.slashCommands = client.slashCommands;
        }
        
        const handled = await commandHandler.handleSlashCommand(interaction);
        if (handled) {
          console.log(`Slash command ${interaction.commandName} handled by commandHandler`);
          return; // Command was handled by the handler
        }
      } catch (handlerError) {
        console.error(`Error using commandHandler for slash command ${interaction.commandName}:`, handlerError);
        // Fall back to the direct execution method below
      }

      // Fall back to direct slash command execution
      const command = client.slashCommands.get(interaction.commandName);
      if (!command) return;

      console.log('Executing slash command:', interaction.commandName);
      await command.execute(interaction, db);
      console.log('Slash command execution completed');
    } catch (error) {
      console.error('Error handling slash command:', error.stack || error);
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
    }
  });

  // Error event
  client.on(Events.Error, error => {
    console.error('Discord client error:', error);
  });

  // Warn event
  client.on(Events.Warn, info => {
    console.warn('Discord client warning:', info);
  });
}

// Handle XP gain and leveling system
async function handleXpGain(message) {
  try {
    const userId = message.author.id;
    const serverId = message.guild.id;

    // Check cooldown
    if (client.cooldowns.has('xp')) {
      const timestamps = client.cooldowns.get('xp');
      if (timestamps.has(userId)) {
        const lastMessageTime = timestamps.get(userId);
        const cooldown = 60 * 1000; // 1 minute cooldown

        if (Date.now() - lastMessageTime < cooldown) {
          return;
        }
      }
    }

    // Update cooldown
    if (!client.cooldowns.has('xp')) {
      client.cooldowns.set('xp', new Collection());
    }
    client.cooldowns.get('xp').set(userId, Date.now());

    // Calculate XP gain
    const xpGain = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
    await db.updateUserXP(userId, serverId, xpGain);

    // Check for level up
    const userLevel = await db.getUserLevel(userId, serverId);
    const xpToNextLevel = userLevel.level * 100;
    
    if (userLevel.xp >= xpToNextLevel) {
      const newLevel = userLevel.level + 1;
      await db.updateUserLevel(userId, serverId, newLevel);

      const levelUpEmbed = new EmbedBuilder()
        .setColor('#4CAF50')
        .setTitle('🎉 Level Up! 🎉')
        .setDescription(`${message.author}, you've reached level **${newLevel}**!`)
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
          { name: 'Next Level', value: `${newLevel + 1}`, inline: true },
          { name: 'XP to Next', value: `${xpToNextLevel - userLevel.xp}`, inline: true }
        )
        .setFooter({ text: 'Leveling system' })
        .setTimestamp();

      await message.channel.send({ embeds: [levelUpEmbed] });
    }
  } catch (error) {
    handleError(error, 'handleXpGain');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Bot is shutting down...');
  try {
    await db.close();
    console.log('Database connection closed');
    client.destroy();
    process.exit(0);
  } catch (error) {
    handleError(error, 'Shutdown process');
    process.exit(1);
  }
});

// Start the bot
startBot();
