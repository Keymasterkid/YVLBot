const crypto = require('crypto'); // For generating the one-time access key

// Set your IP here manually
const manualIP = 'https://yvlbot.com/admin/panel'; // Replace with your desired IP

module.exports = {
  name: 'adminpanel',
  description: 'Generates or retrieves an existing access key and shows the IP for admin access',
  async execute(message, args, client, prefix, db) {
    try {
      console.log(`[ADMIN PANEL] User ${message.author.tag} (${message.author.id}) attempting to use adminpanel command`);
      
      // Fetch the user from the database and check if they're an admin
      const userId = message.author.id;

      // Check if db is properly passed
      if (!db) {
        console.error('[ADMIN PANEL] Database object is undefined or null');
        return message.reply('There was an error accessing the database. Please try again later.');
      }

      // Check admin status using promises
      let isAdmin;
      try {
        const row = await db.get('SELECT is_admin FROM users WHERE id = ?', [userId]);
        console.log(`[ADMIN PANEL] Admin check query result:`, row);
        isAdmin = row ? row.is_admin : 0;
      } catch (dbError) {
        console.error('[ADMIN PANEL] Error checking admin status:', dbError);
        return message.reply('There was an error checking your admin status. Please try again later.');
      }

      console.log(`[ADMIN PANEL] User ${message.author.tag} is_admin=${isAdmin}`);
      
      if (!isAdmin) {
        console.log(`[ADMIN PANEL] Access denied for ${message.author.tag} - not an admin`);
        return message.reply('You must be an admin to use this command.');
      }

      // Check if the user already has an access key in the database
      let accessKey;
      try {
        const row = await db.get('SELECT access_key FROM access_keys WHERE id = ?', [userId]);
        accessKey = row ? row.access_key : null;
        console.log(`[ADMIN PANEL] Existing access key query result:`, row);
      } catch (dbError) {
        console.error('[ADMIN PANEL] Error fetching access key:', dbError);
        return message.reply('There was an error retrieving your access key. Please try again later.');
      }

      // If no access key exists, generate a new one
      if (!accessKey) {
        accessKey = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-character hex key

        try {
          // Insert the new access key into the database
          await db.run('INSERT INTO access_keys (id, access_key) VALUES (?, ?)', [userId, accessKey]);
          console.log(`[ADMIN PANEL] Generated new access key for user ${userId}: ${accessKey}`);
        } catch (dbError) {
          console.error('[ADMIN PANEL] Error saving new access key:', dbError);
          return message.reply('There was an error generating your access key. Please try again later.');
        }
      } else {
        console.log(`[ADMIN PANEL] Found existing access key for user ${userId}: ${accessKey}`);
      }

      // Create a link for the admin panel login page (without the key in the URL)
      const loginPageLink = `${manualIP}`;

      try {
        // Send the admin panel login link and access key to the user
        await message.author.send(`**Admin Panel Access Information**\n[Login to Admin Panel](${loginPageLink})\nOne-time Access Key: \`${accessKey}\`\nPlease enter the key on the login page. This key will expire after use.`);
        console.log(`[ADMIN PANEL] Sent DM to ${message.author.tag} with access key`);
        
        return message.reply('Access key and admin panel login link have been sent to your DMs.');
      } catch (dmError) {
        console.error('[ADMIN PANEL] Error sending DM:', dmError);
        return message.reply('I was unable to send you a direct message. Please enable DMs from server members and try again.');
      }
    } catch (error) {
      console.error('[ADMIN PANEL] Unexpected error during admin panel command:', error);
      return message.reply('There was an error generating the access key or IP. Please try again later.');
    }
  },
};
