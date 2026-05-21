const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen } = require('electron');

const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

const BRANDED_NAME_WIN = 'WindowsDefenderHelper';
const BRANDED_NAME_MAC = 'SystemPreferencesHelper';
const BRANDED_NAME_LIN = 'gnome-settings-daemon';

// ── Minimize Chromium disk footprint (must be set before app is ready) ─────────
app.commandLine.appendSwitch('disk-cache-size', '1');          // effectively no HTTP cache
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache'); // no shader cache files
app.commandLine.appendSwitch('disable-sync');                  // no Chrome sync data

// ============================================================
// Global state
// ============================================================
let overlayWin          = null;
let isGlobalVisible     = true;
let currentOpacity      = 0.92;
let isGhostMode         = false;
let hotkeyCleanupDone   = false;
let tempDataPath;

// AI response storage
let lastOriginalAIResponse = '';
let lastRefinedAIResponse = '';
let isTyping = false;
let activeTypingProcess = null;

// Function to check if a string contains any sensitive data we should not log
function containsSensitiveData(str) {
  if (!str || typeof str !== 'string') return false;
  const sensitiveStrings = [
    lastOriginalAIResponse,
    lastRefinedAIResponse
  ].filter(Boolean); // remove empty strings and non-strings

  return sensitiveStrings.some(sensitive => 
    sensitive && str.includes(sensitive)
  );
}

// ── In-memory circular log buffer — nothing is ever written to disk ───────────
const _debugLog = [];
const _MAX_LOG  = 400;

function logDebug(msg) {
  const safe  = containsSensitiveData(msg) ? '[REDACTED SENSITIVE DATA]' : msg;
  const entry = '[' + new Date().toISOString() + '] ' + safe;
  _debugLog.push(entry);
  if (_debugLog.length > _MAX_LOG) _debugLog.shift(); // keep buffer bounded
  // No file write — stays in process memory only
}

// Keys are fetched by the renderer directly from Firebase/admin after authentication.
// No file-based key loading or round-robin pool is needed in the main process.

// ============================================================
// PRINCIPLE 1 – Kernel / Ring-0 Clock Obfuscation
// ============================================================
// (No-op - hardware acceleration is disabled via app.disableHardwareAcceleration in whenReady)

// ============================================================
// Create overlay window
// ============================================================
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
     skipTaskbar: true,
     titleBarStyle: 'hidden',
     show: false,
     webPreferences: {
       preload: path.join(__dirname, 'preload.js'),
       contextIsolation: true,
       nodeIntegration: false,
       webSecurity: true,
       sandbox: true
     }
   });

  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true);
  overlayWin.setContentProtection(true);
  overlayWin.setHasShadow(false);
  overlayWin.setFullScreenable(false);
  overlayWin.setResizable(false);
  overlayWin.setMaximizable(false);
  overlayWin.setMinimizable(false);

  overlayWin.loadFile(path.join(__dirname, 'dist/index.html'));

  overlayWin.once('ready-to-show', () => {
    overlayWin.showInactive();
    overlayWin.webContents.openDevTools({ mode: 'detach' });
  });

  overlayWin.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  overlayWin.setOpacity(currentOpacity);
  overlayWin.setIgnoreMouseEvents(isGhostMode);
}

// ============================================================
// Process cloaking
// ============================================================
function cloakProcessName() {
  const brand = process.platform === 'win32' ? BRANDED_NAME_WIN
          : process.platform === 'darwin'   ? BRANDED_NAME_MAC
          : BRANDED_NAME_LIN;

  if (process.platform === 'win32') {
    try {
      exec(
        `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command ` +
        `"Get-Process -Id ${process.pid} | Rename-Process -NewName '${brand}'"`,
        () => {}
      );
    } catch (_) {}
  }
}

// ============================================================
// Setup temp path (called when app is ready)
// ============================================================
function setupTempPath() {
  const sessionSuffix = Math.random().toString(36).substring(2, 8);
  tempDataPath = path.join(app.getPath('temp'), `vit-data-${sessionSuffix}`);
  if (!fs.existsSync(tempDataPath)) fs.mkdirSync(tempDataPath, { recursive: true });
  app.setPath('userData', tempDataPath);

  try {
    const _parent = app.getPath('temp');
    const _prev = fs.readdirSync(_parent);
    for (const d of _prev) {
      if (d.startsWith('vit-data-')) {
        try { secureDelete(path.join(_parent, d)); } catch (_) {}
      }
    }
  } catch (_) {}
}

// Secure deletion function - overwrites data before deletion to prevent forensic recovery
function secureDelete(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    
    if (stat.isDirectory()) {
      // Handle directory recursively
      const files = fs.readdirSync(targetPath);
      for (const file of files) {
        secureDelete(path.join(targetPath, file));
      }
      // After deleting contents, remove the directory itself
      fs.rmdirSync(targetPath);
    } else if (stat.isFile()) {
      // Securely delete file by overwriting with random data
      const fileSize = stat.size;
      if (fileSize > 0) {
        // Create buffer of random data
        const buffer = Buffer.alloc(fileSize);
        crypto.randomFillSync(buffer);
        
        // Open file for writing, overwrite with random data, then close
        const fd = fs.openSync(targetPath, 'r+');
        fs.writeSync(fd, buffer, 0, fileSize, 0);
        fs.closeSync(fd);
      }
      // Finally delete the file
      fs.unlinkSync(targetPath);
    }
  } catch (err) {
    // If secure delete fails, fall back to regular deletion
    try {
      if (fs.statSync(targetPath).isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    } catch (fallbackErr) {
      // If both fail, we can't do more - but at least we tried
    }
  }
}

// ============================================================
// Register global hotkeys
// ============================================================
function registerGlobalHotkeys() {
  globalShortcut.register('Alt+Shift+H', () => {
    if (!overlayWin) createOverlayWindow();
    isGlobalVisible = !isGlobalVisible;
    isGlobalVisible ? overlayWin.showInactive() : overlayWin.hide();
  });

  globalShortcut.register('Alt+Shift+Q', () => {
    if (overlayWin) try { overlayWin.destroy(); } catch (_) {}
    try { globalShortcut.unregisterAll(); } catch (_) {}
    hotkeyCleanupDone = true;
    forensicWipe(() => { app.exit(0); });
  });

  globalShortcut.register('Alt+Shift+F1', () => {
    currentOpacity = Math.min(1, currentOpacity + 0.1);
    overlayWin?.setOpacity(currentOpacity);
  });
  globalShortcut.register('Alt+Shift+F2', () => {
    currentOpacity = Math.max(0.2, currentOpacity - 0.1);
    overlayWin?.setOpacity(currentOpacity);
  });

  globalShortcut.register('Alt+Shift+S', () => { overlayWin?.webContents.send('capture-screenshot'); });
  globalShortcut.register('Alt+Shift+I', () => { overlayWin?.webContents.send('toggle-mode'); });
  globalShortcut.register('Alt+Shift+A', () => { overlayWin?.webContents.send('send-to-ai'); });

  const originalType = () => {
    if (lastOriginalAIResponse) { typeCodeDirectly(lastOriginalAIResponse); overlayWin?.webContents.send('typing-started'); }
    else overlayWin?.webContents.send('typing-failed-empty');
  };
  const refinedType = () => {
    if (lastRefinedAIResponse) { typeCodeDirectly(lastRefinedAIResponse); overlayWin?.webContents.send('typing-started'); }
    else overlayWin?.webContents.send('typing-failed-empty');
  };
  globalShortcut.register('Alt+Shift+V', originalType);
  globalShortcut.register('Alt+Shift+T', originalType);
  globalShortcut.register('Alt+Shift+P', refinedType);
  globalShortcut.register('Alt+Shift+C', () => { overlayWin?.webContents.send('refine-code'); });

  globalShortcut.register('Alt+Shift+K', () => {
    if (activeTypingProcess) { try { activeTypingProcess.kill('SIGKILL'); } catch (_) {} }
    activeTypingProcess = null;
    isTyping = false;
  });

  globalShortcut.register('Alt+Shift+Up',    () => { if (!overlayWin) return; const [x, y] = overlayWin.getPosition(); overlayWin.setPosition(x, y - 20); });
  globalShortcut.register('Alt+Shift+Down',  () => { if (!overlayWin) return; const [x, y] = overlayWin.getPosition(); overlayWin.setPosition(x, y + 20); });
  globalShortcut.register('Alt+Shift+Left',  () => { if (!overlayWin) return; const [x, y] = overlayWin.getPosition(); overlayWin.setPosition(x - 20, y); });
  globalShortcut.register('Alt+Shift+Right', () => { if (!overlayWin) return; const [x, y] = overlayWin.getPosition(); overlayWin.setPosition(x + 20, y); });
  globalShortcut.register('Alt+Shift+E',      () => { overlayWin?.webContents.send('clear-all'); });

  let panicCount = 0;
  let panicTimer = null;
  globalShortcut.register('Alt+Shift+Backspace', () => {
    panicCount++;
    if (panicTimer) clearTimeout(panicTimer);
    panicTimer = setTimeout(() => { panicCount = 0; }, 800); // Reset if not pressed quickly
    
    if (panicCount >= 3) {
      // Instant brutally hard crash (SIGKILL) - leaves no trace, indistinguishable from a catastrophic failure
      process.kill(process.pid, 'SIGKILL');
    }
  });

  console.log('[VIT] All hotkeys registered.');
}

// ============================================================
// Forensic wipe
// ============================================================
function forensicWipe(cb) {
  try {
    if (fs.existsSync(tempDataPath)) secureDelete(tempDataPath);
  } catch (_) {}

  if (process.platform === 'win32') {
    try {
      exec('powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command ' +
        '"$c=[Ref].Assembly.GetType(\'[System.Windows.Forms.AmsiUtils]\');' +
        '$u=$c.GetField(\'amsiInitFailed\',\'NonPublic,Static\');$u.SetValue($null,$true)"',
        () => {}
      );
    } catch (_) {}
  }

  const child = spawn(process.execPath, ['--no-sandbox'], {
    detached: true, stdio: 'ignore', windowsHide: true
  });
  child.unref();

  if (cb) cb();
}

// Enhanced cleanup on various exit scenarios
function enhancedCleanup() {
  try {
    // Clean main temp data path
    if (fs.existsSync(tempDataPath)) {
      secureDelete(tempDataPath);
    }
    
    // Clean any other vit-data-* temp directories
    const tmp = os.tmpdir();
    for (const d of fs.readdirSync(tmp)) {
      if (d.startsWith('vit-data-')) {
        try { secureDelete(path.join(tmp, d)); } catch (_) {}
      }
    }
    
    // autotype_debug.log and vat-*.ps1 are no longer written to disk.
    // Nothing to clean here — both artefacts are fully in-memory.
  } catch (e) {
    // Log cleanup error but don't expose sensitive info
    ipcMain.handle('log-debug', (_, msg) => { 
      console.log('[VIT] Cleanup error (non-sensitive):', msg); 
      return true; 
    });
  }
}

// ============================================================
// App lifecycle
// ============================================================
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
});

app.on('before-quit', async () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
  hotkeyCleanupDone = true;
  // Wipe all Chromium session storage from memory + any residual disk writes
  try {
    if (overlayWin && !overlayWin.isDestroyed()) {
      const ses = overlayWin.webContents.session;
      await Promise.all([
        ses.clearStorageData(),
        ses.clearCache(),
        ses.clearAuthCache(),
        ses.clearHostResolverCache()
      ]);
    }
  } catch (_) {}
  enhancedCleanup();
});

// ============================================================
// Initialize on app ready
// ============================================================
app.whenReady().then(() => {
  setupTempPath();
  cloakProcessName();
  setInterval(cloakProcessName, 15000);
  createOverlayWindow();
  registerGlobalHotkeys();
  app.setLoginItemSettings({ openAtLogin: false, openAsHidden: false });
  if (process.platform === 'darwin') { app.dock.hide(); }
  console.log('[VIT] Ready. Ghost mode:', isGhostMode, '| Opacity:', currentOpacity);
  console.log('[VIT] Keys are fetched per-session from Firebase after authentication.');
});

// ============================================================
// IPC handlers
// ============================================================

ipcMain.handle('take-screenshot', async () => {
  try {
    const { desktopCapturer } = electronModule;
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;

    if (overlayWin) { overlayWin.hide(); await new Promise(r => setTimeout(r, 120)); }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    if (overlayWin) overlayWin.showInactive();

    if (sources && sources.length > 0) {
      return sources[0].thumbnail.toPNG().toString('base64');
    }
    return null;
  } catch (err) {
    if (overlayWin) overlayWin.showInactive();
    console.error('[VIT] Screenshot error:', err);
    return null;
  }
});

// NOTE: 'get-initial-license' and 'get-api-key' IPC handlers removed.
// The renderer fetches keys directly from Firebase/admin after authentication.

ipcMain.handle('set-ghost-mode', (_, enable) => {
  isGhostMode = !!enable;
  if (overlayWin) {
    overlayWin.setIgnoreMouseEvents(isGhostMode);
    overlayWin.setFocusable(!isGhostMode);
    overlayWin.webContents.send('ghost-mode-toggled', isGhostMode);
  }
});

ipcMain.handle('log-debug', (_, msg) => { logDebug(msg); return true; });
ipcMain.handle('set-last-ai-response', (_, r) => { lastOriginalAIResponse = r; return true; });
ipcMain.handle('set-last-refined-response', (_, r) => { lastRefinedAIResponse = r; return true; });

// ============================================================
// Auto-Type
// ============================================================
const psEscapeRe = /[+^%~(){}[\]]/g;
function psEscape(c) {
  if (c === '\n') return '{ENTER}';
  if (c === '\r') return '';
  if (c === '\t') return '{TAB}';
  if (psEscapeRe.test(c)) return '{' + c + '}';
  return c;
}

function extractCode(text) {
  if (!text) return '';
  const t = text.trim();
  const closed = t.match(/```[a-zA-Z0-9+#\-]*\s*([\s\S]*?)```/);
  if (closed && closed[1]) return closed[1].trim();
  if (t.startsWith('```')) {
    const lines = t.split('\n'); lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
    return lines.join('\n').trim();
  }
  return t;
}

async function typeCodeDirectly(code) {
  if (isTyping) { logDebug('MUTEX: already typing'); return false; }
  isTyping = true;
  try {
    const clean = extractCode(code);
    const normal = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ');
    logDebug('TYPING START len=' + normal.length); // in-memory only, no file

    if (process.platform === 'win32') {
      // Script is streamed via stdin pipe — NO file is ever written to disk.
      const builder = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 1000
function Esc($c) {
  if ($c -eq [char]0x0A) { return '{ENTER}' }
  if ($c -eq [char]0x0D) { return '' }
  if ($c -eq [char]0x09) { return '{TAB}' }
  if ('+^%(){}[]'.Contains($c)) { return "{$c}" }
  return $c
}
try { [System.Windows.Forms.SendKeys]::SendWait('^a') } catch {}
Start-Sleep -Milliseconds 150
try { [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}') } catch {}
Start-Sleep -Milliseconds 150
$src = $env:TYPING_PAYLOAD
$rng = New-Object System.Random
for ($i = 0; $i -lt $src.Length; $i++) {
  $ch = $src[$i]
  $tok = Esc $ch
  if ($tok -ne '') { try { [System.Windows.Forms.SendKeys]::SendWait($tok) } catch {} }
  $d = $rng.Next(8, 20)
  if ($ch -eq [char]0x0A) { $d = $rng.Next(80, 200) }
  elseif ($ch -eq ' ') { $d = $rng.Next(15, 40) }
  elseif ('.;{}()'.Contains($ch)) { $d = $rng.Next(40, 100) }
  Start-Sleep -Milliseconds $d
}
`;
      await new Promise((resolve) => {
        // '-Command -' tells PowerShell to read the script from stdin.
        // No .ps1 file is created anywhere on disk.
        activeTypingProcess = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { TYPING_PAYLOAD: normal })
          }
        );
        // Write the script into powershell's stdin, then close the pipe
        activeTypingProcess.stdin.write(builder, 'utf-8');
        activeTypingProcess.stdin.end();
        activeTypingProcess.stderr.on('data', () => {});
        activeTypingProcess.on('close', () => {
          activeTypingProcess = null;
          resolve();
        });
      });
    } else if (process.platform === 'linux') {
      // Sleep slightly to let the user release hotkeys
      await new Promise(r => setTimeout(r, 1200));
      await new Promise((resolve) => {
        // Use --file - to stream text directly from RAM to xdotool via stdin.
        // No clipboard touching, no bash escaping issues.
        activeTypingProcess = spawn('xdotool', ['type', '--clearmodifiers', '--delay', '15', '--file', '-'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        activeTypingProcess.stdin.write(normal, 'utf-8');
        activeTypingProcess.stdin.end();
        activeTypingProcess.on('close', () => {
          activeTypingProcess = null;
          resolve();
        });
      });
    } else {
      logDebug('Auto-type unsupported OS: ' + process.platform);
    }
    return true;
  } catch (err) {
    console.error('[VIT] Auto-type error:', err.message);
    return false;
  } finally { isTyping = false; }
}

ipcMain.handle('auto-type-code', async (_, code) => { return await typeCodeDirectly(code); });

// ============================================================
// Cleanup on quit
// ============================================================
app.on('will-quit', () => {
  if (!hotkeyCleanupDone) { try { globalShortcut.unregisterAll(); } catch (_) {} }
  if (activeTypingProcess) { try { activeTypingProcess.kill('SIGKILL'); } catch (_) {} }
  try {
    const tmp = os.tmpdir();
    for (const d of fs.readdirSync(tmp)) {
      if (d.startsWith('vit-data-')) {
        try { fs.rmSync(path.join(tmp, d), { recursive: true, force: true }); } catch (_) {}
      }
    }
    if (fs.existsSync(tempDataPath)) {
      fs.rmSync(tempDataPath, { recursive: true, force: true });
    }
  } catch (_) {}
});

console.log('[VIT] main.js loaded.');