const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// app.disableHardwareAcceleration();

// Disable GPU disk caches and shader cache to bypass 'Access is denied' cache locks
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');

// ─── Store userData in uniquely named temp folder (prevents lock collisions) ────
const sessionSuffix = Math.random().toString(36).substring(2, 8);
const tempDataPath = path.join(app.getPath('temp'), `vit-data-${sessionSuffix}`);
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
  // Hide / Show overlay
  globalShortcut.register('Alt+Shift+H', () => {
    if (!overlayWin) return;
    if (isVisible) overlayWin.hide();
    else overlayWin.showInactive();
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

  // Toggle Mode (between MCQ and Coding/AI mode)
  globalShortcut.register('Alt+Shift+I', () => {
    overlayWin?.webContents.send('toggle-mode');
  });

  // Send to AI
  globalShortcut.register('Alt+Shift+A', () => {
    overlayWin?.webContents.send('send-to-ai');
  });

  // Refine / Fix Code (Self-Correction via Alt+Shift+F)
  globalShortcut.register('Alt+Shift+F', () => {
    overlayWin?.webContents.send('refine-code');
  });

  // Auto-Type Code (registered under multiple hotkeys to bypass blocks)
  const autoTypeTrigger = () => {
    try {
      const os = require('os');
      const fs = require('fs');
      const logPath = path.join(os.tmpdir(), 'autotype_debug.log');
      fs.writeFileSync(logPath, `[HOTKEY] Auto-type hotkey pressed at ${new Date().toISOString()}! lastAIResponse length: ${lastAIResponse ? lastAIResponse.length : 0}\n`, 'utf-8');
    } catch (e) {}
    if (lastAIResponse) {
      typeCodeDirectly(lastAIResponse);
    }
  };

  const regV = globalShortcut.register('Alt+Shift+V', autoTypeTrigger);
  const regT = globalShortcut.register('Alt+Shift+T', autoTypeTrigger);
  const regP = globalShortcut.register('Alt+Shift+P', autoTypeTrigger);
  const regC = globalShortcut.register('Alt+Shift+C', () => {
    const text = clipboard.readText();
    overlayWin?.webContents.send('clipboard-text', text);
  });
  
  // Kill/Abort Auto-typing mid-way
  const regK = globalShortcut.register('Alt+Shift+K', () => {
    if (activeTypingProcess) {
      try {
        activeTypingProcess.kill();
        const os = require('os');
        const fs = require('fs');
        const logPath = path.join(os.tmpdir(), 'autotype_debug.log');
        fs.appendFileSync(logPath, `[ABORT] Auto-type aborted by Alt+Shift+K at ${new Date().toISOString()}!\n`, 'utf-8');
      } catch (e) {}
      activeTypingProcess = null;
    }
    isTyping = false;
  });

  console.log(`Shortcut registration status: Alt+Shift+V (${regV}), Alt+Shift+T (${regT}), Alt+Shift+P (${regP}), Alt+Shift+C (${regC}), Alt+Shift+K (${regK})`);

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

    // HIDE OVERLAY WINDOW BEFORE SCREENSHOT TO AVOID CAPTURING THE PILL/UI
    if (overlayWin) {
      overlayWin.hide();
      // Sleep slightly to let the window manager process the hide event
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: width, height: height } // Exact resolution (fast, lightweight, 100% stable)
    });

    // SHOW OVERLAY WINDOW AGAIN AFTER SCREENSHOT
    if (overlayWin) {
      overlayWin.showInactive(); // show inactive to prevent stealing focus!
    }

    if (sources && sources.length > 0) {
      // sources[0] is usually the entire primary screen
      const image = sources[0].thumbnail;
      return image.toPNG().toString('base64');
    }
    return null;
  } catch (err) {
    if (overlayWin) {
      overlayWin.showInactive();
    }
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

// Global variable to hold the last AI response directly in the main process
let lastAIResponse = '';
let isTyping = false;
let activeTypingProcess = null;

ipcMain.handle('set-last-ai-response', (event, response) => {
  lastAIResponse = response;
  return true;
});

// Direct mechanical keyboard typist using native PowerShell SendKeys via a temporary file
async function typeCodeDirectly(code) {
  if (isTyping) {
    console.log("⚠️ Auto-typing already in progress. Ignoring duplicate trigger.");
    try {
      const os = require('os');
      const logPath = path.join(os.tmpdir(), 'autotype_debug.log');
      fs.appendFileSync(logPath, `[MUTEX] Blocked duplicate auto-type trigger!\n`, 'utf-8');
    } catch (e) {}
    return false;
  }
  
  isTyping = true;
  try {
    const { exec } = require('child_process');
    const os = require('os');
    
    // Extract only the clean code block (removes markdown backticks and explanations!)
    const cleanCode = extractCode(code);
    
    const normalized = cleanCode
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, '    ');

    const logPath = path.join(os.tmpdir(), 'autotype_debug.log');
    fs.writeFileSync(logPath, `Starting auto-type on platform ${process.platform} with code length: ${code.length}\n`, 'utf-8');

    if (process.platform === 'win32') {
      // ── Windows Native Typing Strategy ───────────────────────────────────────
      // Helper to escape SendKeys special characters for a whole line
      function escapeLine(line) {
        let result = '';
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (['+', '^', '%', '~', '(', ')', '{', '}'].includes(char)) {
            result += `{${char}}`;
          } else {
            result += char;
          }
        }
        return result;
      }
      
      const lines = normalized.split('\n');
      const tokens = [];
      
      // Automatically select all (Ctrl+A) and delete to clear any duplicate templates before typing!
      tokens.push('^a', '{BACKSPACE}');
      
      // Build character-by-character typing tokens
      lines.forEach((line, idx) => {
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (['+', '^', '%', '~', '(', ')', '{', '}'].includes(char)) {
            tokens.push(`{${char}}`);
          } else {
            tokens.push(char);
          }
        }
        if (idx < lines.length - 1) {
          tokens.push('{ENTER}');
        }
      });
      
      const tokenFileContent = tokens.join('\r\n');
      const tempFilePath = path.join(os.tmpdir(), `study_ai_autotype_${Date.now()}.txt`);
      fs.writeFileSync(tempFilePath, tokenFileContent, 'utf16le');
      
      const normalizedPath = tempFilePath.replace(/\\/g, '/');
      const psCommand = `
        $ProgressPreference = 'SilentlyContinue';
        $csharp = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class HardwareKeyboard {
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    private static extern short VkKeyScan(char ch);

    private const int KEYEVENTF_KEYUP = 0x0002;
    private const byte VK_SHIFT = 0x10;
    private const byte VK_CONTROL = 0x11;
    private const byte VK_RETURN = 0x0D;
    private const byte VK_BACK = 0x08;

    public static void TypeText(string text, int minDwell, int maxDwell) {
        Random rnd = new Random();
        if (text == "^a") {
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event(0x41, 0, 0, UIntPtr.Zero);
            Thread.Sleep(rnd.Next(minDwell, maxDwell));
            keybd_event(0x41, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            return;
        }
        if (text == "{BACKSPACE}") {
            keybd_event(VK_BACK, 0, 0, UIntPtr.Zero);
            Thread.Sleep(rnd.Next(minDwell, maxDwell));
            keybd_event(VK_BACK, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            return;
        }
        if (text == "{ENTER}") {
            keybd_event(VK_RETURN, 0, 0, UIntPtr.Zero);
            Thread.Sleep(rnd.Next(minDwell, maxDwell));
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            return;
        }

        if (text.StartsWith("{") && text.EndsWith("}") && text.Length > 2) {
            text = text.Substring(1, text.Length - 2);
        }

        foreach (char c in text) {
            short vkCode = VkKeyScan(c);
            byte vk = (byte)(vkCode & 0xFF);
            byte shiftState = (byte)(vkCode >> 8);
            bool needsShift = (shiftState & 1) != 0;

            if (vkCode == -1) {
                // Fallback virtual-key mappings for common symbols when VkKeyScan fails on custom layouts
                if (c == '\\') { vk = 0xDC; needsShift = false; }
                else if (c == '/') { vk = 0xBF; needsShift = false; }
                else if (c == ':') { vk = 0xBA; needsShift = true; }
                else if (c == ';') { vk = 0xBA; needsShift = false; }
                else if (c == '"') { vk = 0xDE; needsShift = true; }
                else if (c == '\'') { vk = 0xDE; needsShift = false; }
                else if (c == '<') { vk = 0xBC; needsShift = true; }
                else if (c == '>') { vk = 0xBE; needsShift = true; }
                else if (c == '?') { vk = 0xBF; needsShift = true; }
                else if (c == '[') { vk = 0xDB; needsShift = false; }
                else if (c == ']') { vk = 0xDD; needsShift = false; }
                else if (c == '{') { vk = 0xDB; needsShift = true; }
                else if (c == '}') { vk = 0xDD; needsShift = true; }
                else if (c == '|') { vk = 0xDC; needsShift = true; }
                else if (c == '\`') { vk = 0xC0; needsShift = false; }
                else if (c == '~') { vk = 0xC0; needsShift = true; }
                else if (c == '!') { vk = 0x31; needsShift = true; }
                else if (c == '@') { vk = 0x32; needsShift = true; }
                else if (c == '#') { vk = 0x33; needsShift = true; }
                else if (c == '$') { vk = 0x34; needsShift = true; }
                else if (c == '%') { vk = 0x35; needsShift = true; }
                else if (c == '^') { vk = 0x36; needsShift = true; }
                else if (c == '&') { vk = 0x37; needsShift = true; }
                else if (c == '*') { vk = 0x38; needsShift = true; }
                else if (c == '(') { vk = 0x39; needsShift = true; }
                else if (c == ')') { vk = 0x30; needsShift = true; }
                else if (c == '-') { vk = 0xBD; needsShift = false; }
                else if (c == '_') { vk = 0xBD; needsShift = true; }
                else if (c == '=') { vk = 0xBB; needsShift = false; }
                else if (c == '+') { vk = 0xBB; needsShift = true; }
                else {
                    continue; // Skip unrecognized non-ASCII characters to prevent keyboard lockup
                }
            }

            if (needsShift) {
                keybd_event(VK_SHIFT, 0, 0, UIntPtr.Zero);
                Thread.Sleep(rnd.Next(10, 25));
            }
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            Thread.Sleep(rnd.Next(minDwell, maxDwell));
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

            if (needsShift) {
                Thread.Sleep(rnd.Next(10, 25));
                keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            }

            // ✈️ Flight Time: Delay between characters to mimic natural human typing speed (60-120 WPM)
            Thread.Sleep(rnd.Next(2, 8));
        }
    }
}
"@;
        Add-Type -TypeDefinition $csharp;
        Start-Sleep -Milliseconds 1200;
        $rand = New-Object System.Random;
        $lines = [System.IO.File]::ReadLines('${normalizedPath.replace(/'/g, "''")}', [System.Text.Encoding]::Unicode);
        foreach ($line in $lines) {
            if ($line -eq "") { continue; }
            try {
                [HardwareKeyboard]::TypeText($line, 10, 20);
            } catch { continue; }
            # 🧠 Pause between lines: simulate the developer scanning the code editor line by line
            Start-Sleep -Milliseconds $rand.Next(20, 50);
        }
      `.trim();
      
      const tempScriptPath = path.join(os.tmpdir(), `study_ai_autotype_script_${Date.now()}.ps1`);
      fs.writeFileSync(tempScriptPath, psCommand, 'utf-8');
      
      await new Promise((resolve) => {
        activeTypingProcess = exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempScriptPath.replace(/"/g, '`"')}"`, { windowsHide: true }, (err, stdout, stderr) => {
          activeTypingProcess = null;
          try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
          } catch (e) {}
          
          let logMsg = '';
          if (err) logMsg += `EXEC ERROR: ${err.message}\n`;
          if (stdout) logMsg += `STDOUT: ${stdout}\n`;
          if (stderr) logMsg += `STDERR: ${stderr}\n`;
          if (!err && !stdout && !stderr) logMsg += `SUCCESS: Windows process finished cleanly.\n`;
          fs.appendFileSync(logPath, logMsg, 'utf-8');
          resolve();
        });
      });

    } else if (process.platform === 'linux') {
      // ── Linux Native Typing Strategy ─────────────────────────────────────────
      // We use standard Linux clipboard (xclip) and input injection (xdotool).
      // Writes clean code to a temporary file, loads it into clipboard, and pastes it.
      const tempFilePath = path.join(os.tmpdir(), `study_ai_autotype_${Date.now()}.txt`);
      fs.writeFileSync(tempFilePath, normalized, 'utf-8');

      // Command sequence:
      // 1. Sleep 1200ms to allow user to release physical hotkey.
      // 2. Load temporary file contents into X11 system clipboard.
      // 3. Trigger Ctrl+V keystroke simulation using xdotool.
      const linuxCommand = `sleep 1.2 && xclip -selection clipboard "${tempFilePath}" && xdotool key ctrl+v`;

      await new Promise((resolve) => {
        exec(linuxCommand, (err, stdout, stderr) => {
          try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          } catch (e) {}

          let logMsg = '';
          if (err) logMsg += `EXEC ERROR: ${err.message}\n`;
          if (stdout) logMsg += `STDOUT: ${stdout}\n`;
          if (stderr) logMsg += `STDERR: ${stderr}\n`;
          if (!err && !stdout && !stderr) logMsg += `SUCCESS: Linux process finished cleanly.\n`;
          fs.appendFileSync(logPath, logMsg, 'utf-8');
          resolve();
        });
      });

    } else {
      fs.appendFileSync(logPath, `Unsupported OS platform: ${process.platform}\n`, 'utf-8');
    }
    
    return true;
  } catch (err) {
    console.error('Auto-type error:', err);
    try {
      const os = require('os');
      const logPath = path.join(os.tmpdir(), 'autotype_debug.log');
      fs.appendFileSync(logPath, `CATCH ERROR: ${err.message}\n`, 'utf-8');
    } catch (e) {}
    return false;
  } finally {
    isTyping = false;
  }
}

// Auto-type code handler (still exposed for renderer call)
ipcMain.handle('auto-type-code', async (event, code) => {
  return await typeCodeDirectly(code);
});

// Set ghost mode programmatically
ipcMain.handle('set-ghost-mode', (event, enable) => {
  isGhostMode = enable;
  if (overlayWin) {
    overlayWin.setIgnoreMouseEvents(isGhostMode);
    overlayWin.setFocusable(!isGhostMode); // 🚨 CRITICAL: Prevents pill updates from stealing focus from the exam!
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


app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  
  if (activeTypingProcess) {
    try {
      activeTypingProcess.kill();
    } catch (e) {}
  }
  
  try {
    if (fs.existsSync(tempDataPath)) {
      fs.rmSync(tempDataPath, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore folder lock errors on final process exit
  }
});
