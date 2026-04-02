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

  const providedPasskey = req.headers['x-passkey'] || req.headers['authorization'] || req.query.passkey;
  if (providedPasskey === passkey || providedPasskey === `Bearer ${passkey}`) {
    return next();
  }

  res.status(401).json({ error: 'Unauthorized: Invalid passkey' });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 7860;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
          body { font-family: sans-serif; line-height: 1.6; max-width: 900px; margin: 40px auto; padding: 20px; background: #f4f4f9; }
          h1 { color: #333; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
          h2 { color: #444; margin-top: 30px; }
          code { background: #eee; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
          pre { background: #2d2d2d; color: #ccc; padding: 15px; border-radius: 8px; overflow-x: auto; }
          .endpoint { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
          .method { font-weight: bold; color: #e67e22; }
          .path { font-weight: bold; color: #2980b9; }
          .param { color: #27ae60; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>WPPConnect API Documentation</h1>
        <p>All API requests require authentication via the <code>x-passkey</code> header, <code>Authorization: Bearer &lt;passkey&gt;</code>, or <code>?passkey=...</code> query parameter.</p>
        <p>Base URL: <code>https://leon4gr45-browser-use-webui.hf.space</code></p>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/send-to-group-name</span></h2>
          <p>Find a group by its name and send a message, poll, or link.</p>
          <pre>Body: {
  "groupName": "Team Alpha",
  "message": "Hello Team!",
  "date": "2023-10-27", (optional, will be prepended to message)
  "links": "https://example.com", (optional, will be appended to message)
  "poll": { (optional)
    "name": "Lunch Choice?",
    "options": ["Pizza", "Burgers"]
  }
}</pre>
        </div>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/send-by-link</span></h2>
          <p>Join a group via link and send a message/poll. Useful for automated triggers.</p>
          <pre>Body: {
  "link": "https://chat.whatsapp.com/...",
  "message": "Optional text message",
  "poll": {
    "name": "Poll Name",
    "options": ["Opt1", "Opt2"]
  }
}</pre>
        </div>

        <div class="endpoint">
          <h2><span class="method">GET</span> <span class="path">/api/status</span></h2>
          <p>Get connection status and QR code.</p>
        </div>

        <div class="endpoint">
          <h2><span class="method">POST</span> <span class="path">/api/send</span></h2>
          <p>Standard send endpoint.</p>
          <pre>Body: { "phone": "ID", "message": "Text", "isGroup": true/false }</pre>
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
        catchQR: (base64Qr) => {
          currentStatus = 'QR_CODE';
          qrCodeBase64 = base64Qr;
        },
        statusFind: (statusSession) => {
          if (statusSession === 'isLogged' || statusSession === 'inChat') {
            currentStatus = 'CONNECTED';
            qrCodeBase64 = '';
          }
        },
        headless: true,
        puppeteerOptions: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      });
      currentStatus = 'CONNECTED';
      addLog('WPPConnect client is ready.');
    } catch (error) {
      currentStatus = 'ERROR';
      addLog(`Error: ${error.message}`);
    }
  });

  app.get('/api/status', (req, res) => {
    res.json({ status: currentStatus, qrCode: qrCodeBase64, logs });
  });

  app.get('/api/groups', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') return res.status(400).json({ error: 'Not connected' });
    try {
      const groups = await wppClient.getAllGroups();
      res.json({ success: true, groups });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/send', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') return res.status(400).json({ error: 'Not connected' });
    const { phone, message, isGroup } = req.body;
    try {
      let recipient = phone;
      if (!phone.includes('@')) recipient = isGroup ? `${phone}@g.us` : `${phone}@c.us`;
      const result = await wppClient.sendText(recipient, message);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/send-to-group-name', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') return res.status(400).json({ error: 'Not connected' });
    const { groupName, message, poll, date, links } = req.body;
    try {
      const groups = await wppClient.getAllGroups();
      const group = groups.find(g => g.name === groupName || g.contact?.name === groupName);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const groupId = group.id._serialized;
      let finalMessage = message || '';
      if (date) finalMessage = `[${date}]\n${finalMessage}`;
      if (links) finalMessage = `${finalMessage}\n\n${links}`;

      let result;
      if (poll) {
        result = await wppClient.sendPollMessage(groupId, poll.name, poll.options, { selectableCount: 1 });
      } else {
        result = await wppClient.sendText(groupId, finalMessage);
      }
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/send-by-link', async (req, res) => {
    if (!wppClient || currentStatus !== 'CONNECTED') return res.status(400).json({ error: 'Not connected' });
    const { link, message, poll } = req.body;
    try {
      let inviteCode = link.match(/chat\.whatsapp\.com\/([^?]+)/)?.[1] || link;
      const groupInfo = await wppClient.joinGroup(inviteCode);
      const groupId = typeof groupInfo === 'string' ? groupInfo : groupInfo.id;

      let result;
      if (poll) {
        result = await wppClient.sendPollMessage(groupId, poll.name, poll.options, { selectableCount: 1 });
      } else {
        result = await wppClient.sendText(groupId, message);
      }
      res.json({ success: true, groupId, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();
