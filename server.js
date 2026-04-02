import express from "express";
import { createServer as createViteServer } from "vite";
import * as wppconnect from '@wppconnect-team/wppconnect';
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let wppClient = null;
let currentStatus = 'DISCONNECTED';
let qrCodeBase64 = '';
let logs = [];

function addLog(msg) {
  const timestamp = new Date().toLocaleTimeString();
  logs.push(`[${timestamp}] ${msg}`);
  if (logs.length > 100) logs.shift();
  console.log(`[WPPConnect] ${msg}`);
}

// Middleware to check passkey
function checkPasskey(req, res, next) {
  const passkey = process.env.PASSKEY;
  if (!passkey) {
    return next();
  }

  const providedPasskey = req.headers['x-passkey'] || req.headers['authorization'];
  if (providedPasskey === passkey || providedPasskey === `Bearer ${passkey}`) {
    return next();
  }

  res.status(401).json({ error: 'Unauthorized: Invalid passkey' });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 7860;

  app.use(express.json());

  // Health check endpoint (unprotected)
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // API Documentation endpoint
  app.get("/api-docs", (req, res) => {
    const docs = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>WPPConnect API Documentation</title>
        <style>
          body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; background: #f4f4f9; }
          h1 { color: #333; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
          h2 { color: #444; margin-top: 30px; }
          code { background: #eee; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
          pre { background: #2d2d2d; color: #ccc; padding: 15px; border-radius: 8px; overflow-x: auto; }
          .endpoint { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
          .method { font-weight: bold; color: #e67e22; }
          .path { font-weight: bold; color: #2980b9; }
        </style>
      </head>
      <body>
        <h1>WPPConnect API Documentation</h1>
        <p>All API requests (except <code>/api/login</code>) require authentication via the <code>x-passkey</code> header or <code>Authorization: Bearer &lt;passkey&gt;</code>.</p>
        <p>Base URL: <code>https://auxteam-plandex-backup.hf.space</code></p>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/login</span></h2>
          <p>Verify your passkey.</p>
          <pre>Body: { "passkey": "your_passkey" }</pre>
        </div>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/start</span></h2>
          <p>Initialize the WhatsApp session and generate a QR code.</p>
        </div>

        <div class="endpoint">
          <h2><span class="method">GET</span> <span class="path">/api/status</span></h2>
          <p>Get current connection status, QR code (base64), and recent logs.</p>
        </div>

        <div class="endpoint">
          <h2><span class="method">GET</span> <span class="path">/api/groups</span></h2>
          <p>Retrieve all joined groups (requires CONNECTED status).</p>
        </div>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/send</span></h2>
          <p>Send a text message.</p>
          <pre>Body: {
  "phone": "recipient_id",
  "message": "Hello world!",
  "isGroup": false
}</pre>
        </div>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/send-poll</span></h2>
          <p>Send a poll message.</p>
          <pre>Body: {
  "recipient": "recipient_id",
  "pollName": "Favorite Color?",
  "options": ["Red", "Blue", "Green"],
  "selectableCount": 1,
  "isGroup": false
}</pre>
        </div>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/join-group</span></h2>
          <p>Join a group via invite link.</p>
          <pre>Body: { "link": "https://chat.whatsapp.com/..." }</pre>
        </div>

      </body>
      </html>
    `;
    res.send(docs);
  });

  // Login endpoint
  app.post('/api/login', (req, res) => {
    const { passkey } = req.body;
    const envPasskey = process.env.PASSKEY;

    if (!envPasskey || passkey === envPasskey) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid passkey' });
    }
  });

  // Protect all other API routes
  app.use('/api', (req, res, next) => {
    if (req.path === '/login') return next();
    checkPasskey(req, res, next);
  });

  // API Routes
  app.post('/api/start', async (req, res) => {
    if (currentStatus === 'INITIALIZING' || currentStatus === 'CONNECTED') {
      return res.json({ success: true, status: currentStatus });
    }
    
    currentStatus = 'INITIALIZING';
    qrCodeBase64 = '';
    addLog('Starting WPPConnect session...');
    res.json({ success: true });

    try {
      wppClient = await wppconnect.create({
        session: 'gradio-session',
        catchQR: (base64Qr, asciiQR) => {
          currentStatus = 'QR_CODE';
          qrCodeBase64 = base64Qr;
          addLog('QR Code generated. Waiting for scan...');
        },
        statusFind: (statusSession, session) => {
          addLog(`Session Status: ${statusSession}`);
          if (statusSession === 'isLogged' || statusSession === 'inChat') {
            currentStatus = 'CONNECTED';
            qrCodeBase64 = '';
            addLog('Successfully connected to WhatsApp!');
          }
        },
        headless: true,
        puppeteerOptions: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      });
      
      currentStatus = 'CONNECTED';
      addLog('WPPConnect client is ready.');
    } catch (error) {
      currentStatus = 'ERROR';
      addLog(`Error initializing WPPConnect: ${error.message}`);
      console.error(error);
    }
  });

  app.get('/api/status', (req, res) => {
    res.json({ 
      status: currentStatus, 
      qrCode: qrCodeBase64, 
      logs 
    });
  });

  app.get('/api/groups', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') {
      return res.status(400).json({ error: 'WhatsApp client is not connected.' });
    }
    try {
      const groups = await wppClient.getAllGroups();
      res.json({ success: true, groups });
    } catch (error) {
      addLog(`Failed to fetch groups: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/send', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') {
      return res.status(400).json({ error: 'WhatsApp client is not connected.' });
    }
    
    const { phone, message, isGroup } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Recipient and message are required.' });
    }

    try {
      addLog(`Sending message to ${phone}...`);
      let formattedRecipient = phone;
      if (!phone.includes('@')) {
        formattedRecipient = isGroup ? `${phone}@g.us` : `${phone}@c.us`;
      }
      
      const result = await wppClient.sendText(formattedRecipient, message);
      addLog(`Message successfully sent to ${phone}`);
      res.json({ success: true, result });
    } catch (error) {
      addLog(`Failed to send message: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/send-poll', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') {
      return res.status(400).json({ error: 'WhatsApp client is not connected.' });
    }

    const { recipient, pollName, options, selectableCount, isGroup } = req.body;
    if (!recipient || !pollName || !options || !Array.isArray(options)) {
      return res.status(400).json({ error: 'Recipient, poll name, and options are required.' });
    }

    try {
      addLog(`Sending poll to ${recipient}...`);
      let formattedRecipient = recipient;
      if (!recipient.includes('@')) {
        formattedRecipient = isGroup ? `${recipient}@g.us` : `${recipient}@c.us`;
      }

      const result = await wppClient.sendPollMessage(
        formattedRecipient,
        pollName,
        options,
        { selectableCount: selectableCount || 1 }
      );
      addLog(`Poll successfully sent to ${recipient}`);
      res.json({ success: true, result });
    } catch (error) {
      addLog(`Failed to send poll: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/join-group', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') {
      return res.status(400).json({ error: 'WhatsApp client is not connected.' });
    }

    const { link } = req.body;
    if (!link) {
      return res.status(400).json({ error: 'Group invite link is required.' });
    }

    try {
      addLog(`Attempting to join group via link: ${link}`);
      let inviteCode = link;
      const match = link.match(/chat\.whatsapp\.com\/([^?]+)/);
      if (match && match[1]) {
        inviteCode = match[1];
      }

      const result = await wppClient.joinGroup(inviteCode);
      addLog(`Successfully joined group!`);
      res.json({ success: true, result });
    } catch (error) {
      addLog(`Failed to join group: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
