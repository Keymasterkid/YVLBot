module.exports = {
  name: 'ready',
  async execute(client, db) {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);

    // Log the db instance to verify it is initialized properly
    if (!db || typeof db.get !== 'function') {
      console.error('Database is not initialized correctly or is missing the get method.');
      return;
    }

    const guilds = client.guilds.cache;

    // Using Promise.all for concurrent fetching
    const fetchPromises = guilds.map(async (guild) => {
      try {
        // Fetch all server data from the database for the current guild
        const row = await db.get('SELECT * FROM servers WHERE server_id = ?', [guild.id]);

        // Check if data was found
        if (row) {
          // Log all data in the row
          for (const [key, value] of Object.entries(row)) {
            console.log(`${key}: ${value}`);
          }
        } else {
          console.log(`No data found for server ID: ${guild.id}`);
        }
      } catch (error) {
        console.error(`Error fetching data for server ID ${guild.id}:`, error);
      }
    });

    // Wait for all fetch promises to resolve
    try {
      await Promise.all(fetchPromises);
    } catch (err) {
      console.error('Error during fetching guild data:', err);
    }
  },
};
