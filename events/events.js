const fs = require('fs');

module.exports = (client, db, testMode = false) => { // Added testMode parameter
  const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const event = require(`./${file}`);
    console.log(`Loading event: ${event.name}`); // Log event name

    // Use client.on() for all events and pass the necessary parameters directly
    client.on(event.name, (...args) => {
      // Check if the event has an 'execute' method and call it with client, db, testMode, and other args
      if (typeof event.execute === 'function') {
        event.execute(client, db, ...args, testMode); // Pass testMode here
      } else {
        console.warn(`No execute method found for event: ${event.name}`);
      }
    });
  }

  console.log('All events loaded successfully.');
};
