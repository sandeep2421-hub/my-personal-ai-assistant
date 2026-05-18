const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// app.disableHardwareAcceleration();

// Disable GPU disk caches and shader cache to bypass 'Access is denied' cache locks
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');

// ─── Store userData in uniquely named temp folder (prevents lock collisions) ────
const sessionSuffix = Math.random().toString(36).substring(2, 8);
const tempDataPath = path.join(app.getPath('temp'), `study-ai-data-${sessionSuffix}`);
if (!fs.existsSync(tempDataPath)) fs.mkdirSync(tempDataPath, { recursive: true });
app.setPath('userData', tempDataPath);

let overlayWin = null;
let isVisible = true;
let currentOpacity = 0.9;
let isGhostMode = false; // Start clickable so user can log in

// ─── Command Line Arguments for Stealth Licensing ──────────────────────────────
// E.g.: StudyAIPortable.exe --license=SANDEEP
const licenseArg = process.argv.find(arg => arg.startsWith('--license='));
const initialLicenseKey = licenseArg ? licenseArg.split('=')[1] : null;

// ─── Create overlay window ────────────────────────────────────────────────────
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWin = new BrowserWindow({
    width: 420,
    height: 650,
    x: width - 440,
    y: 60,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true, // Invisible Dock: Hides taskbar icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  // Screen Stealth: Hidden from screen sharing (Zoom, Teams, Discord, OBS) and screenshots
  overlayWin.setContentProtection(true);

  // Load built React app in production, dev server in development
  if (process.env.NODE_ENV === 'development') {
    overlayWin.loadURL('http://localhost:5173');
  } else {
    overlayWin.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Clear cached API key so fresh key always loads on re-login
  overlayWin.webContents.on('did-finish-load', () => {
    overlayWin.webContents.executeJavaScript(`
      localStorage.removeItem('openai_api_key');
      localStorage.removeItem('study_license_key');
    `);
  });


  overlayWin.setOpacity(currentOpacity);
  overlayWin.setIgnoreMouseEvents(isGhostMode);
  overlayWin.on('closed', () => { overlayWin = null; });
}

app.whenReady().then(() => {
  createOverlayWindow();
  registerGlobalHotkeys();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Global Hotkeys ───────────────────────────────────────────────────────────
function registerGlobalHotkeys() {
  // Toggle MCQ / AI mode
  globalShortcut.register('Alt+Shift+I', () => {
    overlayWin?.webContents.send('toggle-mode');
  });

  // Hide / Show overlay
  globalShortcut.register('Alt+Shift+H', () => {
    if (!overlayWin) return;
    if (isVisible) overlayWin.hide();
    else overlayWin.show();
    isVisible = !isVisible;
  });

  // Quit
  globalShortcut.register('Alt+Shift+Q', () => app.quit());

  // Opacity up / down
  globalShortcut.register('Alt+Shift+F1', () => {
    currentOpacity = Math.min(1, currentOpacity + 0.1);
    overlayWin?.setOpacity(currentOpacity);
  });
  globalShortcut.register('Alt+Shift+F2', () => {
    currentOpacity = Math.max(0.2, currentOpacity - 0.1);
    overlayWin?.setOpacity(currentOpacity);
  });

  // Screenshot
  globalShortcut.register('Alt+Shift+S', () => {
    overlayWin?.webContents.send('capture-screenshot');
  });

  // Clipboard paste
  globalShortcut.register('Alt+Shift+C', () => {
    const text = clipboard.readText();
    overlayWin?.webContents.send('clipboard-text', text);
  });

  // Send to AI (AI Mode)
  globalShortcut.register('Alt+Shift+A', () => {
    overlayWin?.webContents.send('send-to-ai');
  });

  // Auto-type last AI response
  globalShortcut.register('Alt+Shift+V', () => {
    overlayWin?.webContents.send('auto-type-code');
  });

  // Move overlay with arrow keys
  globalShortcut.register('Alt+Shift+Up', () => {
    if (!overlayWin) return;
    const [x, y] = overlayWin.getPosition();
    overlayWin.setPosition(x, y - 20);
  });
  globalShortcut.register('Alt+Shift+Down', () => {
    if (!overlayWin) return;
    const [x, y] = overlayWin.getPosition();
    overlayWin.setPosition(x, y + 20);
  });
  globalShortcut.register('Alt+Shift+Left', () => {
    if (!overlayWin) return;
    const [x, y] = overlayWin.getPosition();
    overlayWin.setPosition(x - 20, y);
  });
  globalShortcut.register('Alt+Shift+Right', () => {
    if (!overlayWin) return;
    const [x, y] = overlayWin.getPosition();
    overlayWin.setPosition(x + 20, y);
  });

  // Scroll chat
  globalShortcut.register('Alt+Shift+.', () => {
    overlayWin?.webContents.send('scroll-down');
  });
  globalShortcut.register('Alt+Shift+/', () => {
    overlayWin?.webContents.send('scroll-up');
  });

  // Clear all
  globalShortcut.register('Alt+Shift+E', () => {
    overlayWin?.webContents.send('clear-all');
  });

  // Toggle DevTools (for debugging)
  globalShortcut.register('Alt+Shift+D', () => {
    if (overlayWin?.webContents.isDevToolsOpened()) overlayWin.webContents.closeDevTools();
    else overlayWin?.webContents.openDevTools({ mode: 'detach' });
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Take screenshot natively using Electron (100% reliable, no ASAR bugs!)
ipcMain.handle('take-screenshot', async () => {
  try {
    const { desktopCapturer, screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: width * 2, height: height * 2 } // High-res
    });

    if (sources && sources.length > 0) {
      // sources[0] is usually the entire primary screen
      const image = sources[0].thumbnail;
      return image.toPNG().toString('base64');
    }
    return null;
  } catch (err) {
    console.error('Screenshot error:', err);
    return null;
  }
});

// Provide initial license key to renderer
ipcMain.handle('get-initial-license', () => {
  if (initialLicenseKey) return initialLicenseKey;
  try {
    let licPath = path.join(process.cwd(), 'license.txt');
    if (fs.existsSync(licPath)) {
      console.log('🔑 Loaded custom license key from process.cwd()/license.txt');
      return fs.readFileSync(licPath, 'utf-8').trim();
    }
    licPath = path.join(path.dirname(process.execPath), 'license.txt');
    if (fs.existsSync(licPath)) {
      console.log('🔑 Loaded custom license key from execPath/license.txt');
      return fs.readFileSync(licPath, 'utf-8').trim();
    }
  } catch (e) {
    console.error('Failed to read license.txt:', e);
  }
  return null;
});

// Helper to extract clean code block from markdown AI responses
function extractCode(text) {
  if (!text) return '';
  const trimmed = text.trim();
  
  // Try matching closed block first
  const closedMatch = trimmed.match(/```[a-zA-Z0-9+#\-]*\s*([\s\S]*?)```/);
  if (closedMatch && closedMatch[1]) {
    return closedMatch[1].trim();
  }
  
  // Try matching unclosed block (up to the end of string)
  const unclosedMatch = trimmed.match(/```[a-zA-Z0-9+#\-]*\s*([\s\S]*?)$/);
  if (unclosedMatch && unclosedMatch[1]) {
    return unclosedMatch[1].trim();
  }
  
  // Fallback: If it starts with triple backticks but wasn't captured, strip first line
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    lines.shift();
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    return lines.join('\n').trim();
  }
  
  return trimmed;
}

// Auto-type code using native OS literal key injection (bypasses lab paste blockers)
ipcMain.handle('auto-type-code', async (event, code) => {
  try {
    const { exec } = require('child_process');
    const os = require('os');
    
    // Extract only the clean code block (removes markdown backticks and explanations!)
    const cleanCode = extractCode(code);
    
    // 1. Save original clipboard content so the user's clipboard isn't ruined
    const oldClipboard = clipboard.readText();
    
    // 2. Write the code to the clipboard
    clipboard.writeText(cleanCode);
    
    // 3. Generate a tiny WScript to simulate Ctrl+V (paste) instantly
    let vbsContent = `Set objShell = WScript.CreateObject("WScript.Shell")\nWScript.Sleep 250\nobjShell.SendKeys "^v"\n`;
    
    const vbsPath = path.join(os.tmpdir(), 'study_paste.vbs');
    fs.writeFileSync(vbsPath, vbsContent, 'utf-8');
    
    // Execute the paste action
    await new Promise((resolve) => {
      exec(`cscript //nologo "${vbsPath}"`, () => resolve());
    });
    
    // Clean up temporary script
    try { fs.unlinkSync(vbsPath); } catch (e) {}
    
    // 4. Restore original clipboard content after paste completes
    setTimeout(() => {
      clipboard.writeText(oldClipboard);
    }, 800);
    
    return true;
  } catch (err) {
    console.error('Auto-type error:', err);
    return false;
  }
});

// Set ghost mode programmatically
ipcMain.handle('set-ghost-mode', (event, enable) => {
  isGhostMode = enable;
  if (overlayWin) {
    overlayWin.setIgnoreMouseEvents(isGhostMode);
    overlayWin.webContents.send('ghost-mode-toggled', isGhostMode);
  }
});

// Retrieve custom API key from local apikey.txt file if it exists
ipcMain.handle('get-api-key', async () => {
  try {
    let keyPath = path.join(process.cwd(), 'apikey.txt');
    if (fs.existsSync(keyPath)) {
      console.log('🔑 Loaded custom API key from process.cwd()/apikey.txt');
      return fs.readFileSync(keyPath, 'utf-8').trim();
    }
    keyPath = path.join(path.dirname(process.execPath), 'apikey.txt');
    if (fs.existsSync(keyPath)) {
      console.log('🔑 Loaded custom API key from execPath/apikey.txt');
      return fs.readFileSync(keyPath, 'utf-8').trim();
    }
  } catch (e) {
    console.error('Failed to read apikey.txt:', e);
  }
  return null;
});


app.on('will-quit', () => globalShortcut.unregisterAll());
