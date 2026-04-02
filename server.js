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
    // If no passkey is set in environment, allow access (for initial setup)
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
