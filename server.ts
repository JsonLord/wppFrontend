import express from "express";
import { createServer as createViteServer } from "vite";
import * as wppconnect from '@wppconnect-team/wppconnect';
import path from "path";

let wppClient: wppconnect.Whatsapp | null = null;
let currentStatus = 'DISCONNECTED';
let qrCodeBase64 = '';
let logs: string[] = [];

function addLog(msg: string) {
  const timestamp = new Date().toLocaleTimeString();
  logs.push(`[${timestamp}] ${msg}`);
  if (logs.length > 100) logs.shift();
  console.log(`[WPPConnect] ${msg}`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
    } catch (error: any) {
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
    } catch (error: any) {
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
      // Format recipient ID
      let formattedRecipient = phone;
      if (!phone.includes('@')) {
        formattedRecipient = isGroup ? `${phone}@g.us` : `${phone}@c.us`;
      }
      
      const result = await wppClient.sendText(formattedRecipient, message);
      addLog(`Message successfully sent to ${phone}`);
      res.json({ success: true, result });
    } catch (error: any) {
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
    } catch (error: any) {
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
      // Extract the invite code from the link
      // Example: https://chat.whatsapp.com/EIthl6StDhs3uqkmEFTebE?mode=gi_t
      let inviteCode = link;
      const match = link.match(/chat\.whatsapp\.com\/([^?]+)/);
      if (match && match[1]) {
        inviteCode = match[1];
      }

      const result = await wppClient.joinGroup(inviteCode);
      addLog(`Successfully joined group!`);
      res.json({ success: true, result });
    } catch (error: any) {
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
