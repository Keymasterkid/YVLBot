const fs = require('fs');
const path = require('path');

module.exports = (client, db, testMode = false) => {
  const eventFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.js') && file !== 'events.js');

  for (const file of eventFiles) {
    const filePath = path.join(__dirname, file);
    const event = require(filePath);

    if (typeof event === 'function') {
      // Module pattern: (client, db) => void
      try {
        event(client, db, testMode);
        console.log(`[Events] Loaded module: ${file}`);
      } catch (error) {
        console.error(`[Events] Error loading module ${file}:`, error);
      }
    } else if (event.name && typeof event.execute === 'function') {
      // Event pattern: { name, execute }
      client.on(event.name, (...args) => {
        try {
          event.execute(client, db, ...args);
        } catch (error) {
          console.error(`[Events] Error executing event ${event.name} from ${file}:`, error);
        }
      });
      console.log(`[Events] Loaded event: ${event.name} from ${file}`);
    } else {
      console.warn(`[Events] Invalid event file format: ${file}`);
    }
  }

  console.log('All events loaded successfully.');
};
