import sys
import os

filepath = 'server.js'
content = open(filepath).read()

# Helper function to perform cleanup
cleanup_func = """
async function cleanupSession() {
  addLog('Performing proactive session cleanup...');
  try {
    const tokenPath = path.join(__dirname, 'tokens', 'gradio-session');
    if (fs.existsSync(tokenPath)) {
      // Try to remove lock file specifically first if it exists
      const lockPath = path.join(tokenPath, 'SingletonLock');
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); addLog('Removed SingletonLock'); } catch (e) {}
      }

      // Then remove the whole dir
      fs.rmSync(tokenPath, { recursive: true, force: true });
      addLog('Session tokens directory cleared.');
    }
  } catch (e) {
    addLog(`Cleanup error: ${e.message}`);
  }
}
"""

# Insert the helper function before startServer
if 'async function cleanupSession()' not in content:
    content = content.replace('async function startServer()', cleanup_func + '\nasync function startServer()')

# Update /api/start to use cleanupSession and add more flags
old_start_logic = """  app.post('/api/start', async (req, res) => {
    if (currentStatus === 'INITIALIZING' || currentStatus === 'CONNECTED') {
      return res.json({ success: true, status: currentStatus });
    }

    // Proactive cleanup if we were in ERROR state
    if (currentStatus === 'ERROR') {
      addLog('Attempting to clear stale session tokens...');
      try {
        const tokenPath = path.join(__dirname, 'tokens', 'gradio-session');
        if (fs.existsSync(tokenPath)) {
          fs.rmSync(tokenPath, { recursive: true, force: true });
          addLog('Stale tokens cleared.');
        }
      } catch (e) {
        addLog(`Cleanup error: ${e.message}`);
      }
    }

    currentStatus = 'INITIALIZING';"""

new_start_logic = """  app.post('/api/start', async (req, res) => {
    if (currentStatus === 'CONNECTED') {
      return res.json({ success: true, status: currentStatus });
    }

    // Always cleanup if we are not connected and trying to start
    await cleanupSession();

    currentStatus = 'INITIALIZING';"""

if old_start_logic in content:
    content = content.replace(old_start_logic, new_start_logic)

# Refine catch block
old_catch = """    } catch (error) {
      addLog(`Error: ${error.message}`);
      currentStatus = 'ERROR';

      // Specific handling for locked browser sessions
      if (error.message.includes('browser is already running') || error.message.includes('ERR_NAME_NOT_RESOLVED')) {
        addLog('Detected critical failure. Cleaning up session for next attempt...');
        try {
          const tokenPath = path.join(__dirname, 'tokens', 'gradio-session');
          if (fs.existsSync(tokenPath)) {
            fs.rmSync(tokenPath, { recursive: true, force: true });
            addLog('Session tokens purged.');
          }
        } catch (cleanupErr) {
          addLog(`Cleanup failed: ${cleanupErr.message}`);
        }
      }

      if (wppClient) {
        try { await wppClient.close(); } catch (e) {}
      }
      wppClient = null;
    }"""

new_catch = """    } catch (error) {
      addLog(`Error: ${error.message}`);
      currentStatus = 'ERROR';

      // Always attempt cleanup on initialization error
      await cleanupSession();

      if (wppClient) {
        try { await wppClient.close(); } catch (e) {}
      }
      wppClient = null;
    }"""

if old_catch in content:
    content = content.replace(old_catch, new_catch)

# Add even more stable flags to commonArgs
old_args = """    const commonArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-features=IsolateOrigins,site-per-process',
      '--dns-prefetch-disable',"""

new_args = """    const commonArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-features=IsolateOrigins,site-per-process',
      '--dns-prefetch-disable',
      '--no-default-browser-check',
      '--disable-site-isolation-trials',"""

if old_args in content:
    content = content.replace(old_args, new_args)

open(filepath, 'w').write(content)
