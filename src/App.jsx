import React, { useState, useEffect, useRef } from 'react';
import OverlayWindow from './components/OverlayWindow';
import LoginModal from './components/LoginModal';
import ChatPanel from './components/ChatPanel';
import Dashboard from './components/Dashboard';
import { askAI } from './services/ai';
import { checkLicense, validateLicenseAndGetApiKey, saveLicense } from './services/license';

export default function App() {
  const [isLicensed, setIsLicensed]             = useState(null); // null = checking
  const [mode, setMode]                         = useState('dashboard'); // 'dashboard', 'main', 'ai'
  const [messages, setMessages]                 = useState([]);
  const [screenshots, setScreenshots]           = useState([]);
  const [pendingClipboardText, setPendingText]  = useState('');
  const [lastAIResponse, setLastAIResponse]     = useState('');

  // Pill and visibility states
  const [pillText, setPillText]                 = useState('Study AI');
  const [pillDotColor, setPillDotColor]         = useState('#448aff');
  const [pillGlowing, setPillGlowing]           = useState(false);
  const [pillVisible, setPillVisible]           = useState(false); // MCQ starts completely hidden!

  const chatEndRef = useRef(null);

  // Refs for hotkeys (to prevent stale closure bugs)
  const modeRef = useRef(mode);
  const pendingTextRef = useRef(pendingClipboardText);
  const screenshotsRef = useRef(screenshots);
  const lastAIResponseRef = useRef(lastAIResponse);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { pendingTextRef.current = pendingClipboardText; }, [pendingClipboardText]);
  useEffect(() => { screenshotsRef.current = screenshots; }, [screenshots]);
  useEffect(() => { lastAIResponseRef.current = lastAIResponse; }, [lastAIResponse]);

  const getDefaultPillText = (m) => {
    return m === 'main' ? 'Study AI' : 'Study AI (Coding)';
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addMsg = (role, content, extra = {}) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev, { id, role, content, ...extra }]);
    return id;
  };

  const addUserMsg   = (text, images)   => addMsg('user', text, { images: images || [] });
  const addSystemMsg = (text)           => addMsg('system', text);
  
  const addAIMsg     = (text, temp = false) => {
    const isError = typeof text === 'string' && text.startsWith('❌');
    const shouldVanish = temp && !isError;
    const id = addMsg('assistant', text, { isTemporary: shouldVanish });
    if (shouldVanish) {
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== id));
      }, 12000);  // 12 seconds — plenty of time to read code
    }
  };

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── License check on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function verify() {
      const cliKey = await window.electronAPI.invoke('get-initial-license');
      if (cliKey) {
        const result = await validateLicenseAndGetApiKey(cliKey);
        if (result.valid) {
          saveLicense(cliKey);
          localStorage.setItem('openai_api_key', result.apiKey);
          setIsLicensed(true);
          return;
        }
      }

      const valid = await checkLicense();
      setIsLicensed(valid);
    }
    verify();
  }, []);



  // ── Electron IPC listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLicensed) return;

    const api = window.electronAPI;

    // Toggle MCQ ↔ AI mode
    api.on('toggle-mode', () => {
      setMode(prev => {
        const next = prev === 'main' ? 'ai' : 'main';
        if (next === 'ai') {
          addSystemMsg('🤖 Switched to AI Mode — take screenshots then Alt+Shift+A to send');
          setPillVisible(true); // AI mode overlay is always visible
        } else {
          setMessages([]);
          setPillVisible(false); // MCQ mode overlay starts completely hidden
        }
        setPillText(getDefaultPillText(next));
        setPillDotColor(next === 'main' ? '#448aff' : '#9c27b0');
        return next;
      });
    });

    // Screenshot captured
    api.on('capture-screenshot', async () => {
      const base64 = await api.invoke('take-screenshot');
      
      if (!base64) {
        if (modeRef.current === 'ai') {
          addSystemMsg('❌ Screenshot failed.');
        } else {
          setPillText('❌ Capture failed');
          setPillDotColor('#f44336');
          setPillVisible(true);
          setTimeout(() => {
            setPillVisible(false);
          }, 2000);
        }
        return;
      }

      if (modeRef.current === 'main') {
        // MCQ mode: answer immediately in the pill!
        const prompt = pendingTextRef.current || 'Look at this screenshot and answer the MCQ question shown. State ONLY the correct option letter (A/B/C/D). Do not write anything else.';
        
        askAI(prompt, [base64]).then(answer => {
          const isError = typeof answer === 'string' && answer.startsWith('❌');
          if (isError) {
            setPillText('❌ Error');
            setPillDotColor('#f44336');
            setPillVisible(true);
            setTimeout(() => {
              setPillVisible(false);
            }, 3000);
            return;
          }

          let cleanAnswer = answer.trim();
          
          // Robustly parse the answer to extract ONLY the correct option letter (A, B, C, or D)
          const match = cleanAnswer.match(/^[A-D]\b/i) || cleanAnswer.match(/\b[A-D]\b/i);
          if (match) {
            cleanAnswer = match[0].toUpperCase();
          } else {
            // Fallback: first letter
            cleanAnswer = cleanAnswer.replace(/[^A-Za-z]/g, '').substring(0, 1).toUpperCase() || 'A';
          }

          setPillText(cleanAnswer);
          setPillDotColor('#4caf50'); // green success dot
          setPillGlowing(true); // gold glow
          setPillVisible(true); // make visible!

          setLastAIResponse(answer);

          setTimeout(() => {
            setPillVisible(false);
            setPillGlowing(false);
          }, 4000); // vanish completely after 4 seconds
        });

        setPendingText('');
        setScreenshots([]);
      } else {
        // AI mode: accumulate screenshots
        setScreenshots(prev => {
          const next = [...prev, base64];
          addSystemMsg(`📸 Screenshot #${next.length} captured — press Alt+Shift+A to send`);
          return next;
        });
      }
    });

    // Clipboard text pasted
    api.on('clipboard-text', text => {
      setPendingText(text);
      if (modeRef.current === 'ai') {
        addSystemMsg(`📋 Clipboard captured: "${text.substring(0, 60)}${text.length > 60 ? '…' : ''}"`);
      }
    });

    // Send to AI (AI mode only)
    api.on('send-to-ai', async () => {
      if (modeRef.current !== 'ai') return;

      const currentShots = screenshotsRef.current;
      const currentText = pendingTextRef.current;

      if (currentShots.length === 0 && !currentText) {
        addSystemMsg('⚠️ Nothing to send — take a screenshot or paste text first.');
        return;
      }

      const prompt = currentText || 'Analyze and answer the question in the screenshot(s).';
      addUserMsg(prompt, currentShots);
      addSystemMsg('⏳ Thinking…');
      
      askAI(prompt, currentShots).then(answer => {
        addAIMsg(answer, true); // vanishes after 12 seconds
        setLastAIResponse(answer);
      });

      setPendingText('');
      setScreenshots([]);
    });

    // Auto-type last AI response
    api.on('auto-type-code', async () => {
      const last = lastAIResponseRef.current;
      if (!last) {
        if (modeRef.current === 'ai') {
          addSystemMsg('⚠️ No AI response to type yet.');
        }
        return;
      }
      api.invoke('auto-type-code', last).then(ok => {
        if (modeRef.current === 'ai') {
          if (ok) addSystemMsg('⌨️ Auto-typing AI response…');
          else    addSystemMsg('❌ Auto-type failed — robotjs error.');
        }
      });
    });

    // Scroll helpers
    api.on('scroll-down', () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    api.on('scroll-up',   () => {
      document.querySelector('.chat-panel')?.scrollBy({ top: -120, behavior: 'smooth' });
    });

    // Clear all
    api.on('clear-all', () => {
      setMessages([]);
      setScreenshots([]);
      setPendingText('');
      setLastAIResponse('');
      if (modeRef.current === 'ai') {
        addSystemMsg('🗑️ Cleared all history and screenshots.');
      }
    });

    // Welcome message
    // (Handled by dashboard now)

    // Cleanup
    return () => {
      [
        'toggle-mode', 'capture-screenshot', 'clipboard-text',
        'send-to-ai', 'auto-type-code', 'scroll-down', 'scroll-up',
        'clear-all'
      ].forEach(ch => api.off(ch));
    };
  }, [isLicensed]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLicensed === null) {
    return (
      <div className="glass-overlay" style={{ width: 360, padding: 24, display: 'flex', justifyContent: 'center' }}>
        <p style={{ color: '#78909c', fontSize: 13 }}>⏳ Checking license…</p>
      </div>
    );
  }

  if (!isLicensed) {
    return <LoginModal onSuccess={() => setIsLicensed(true)} />;
  }

  if (mode === 'dashboard') {
    return <Dashboard onActivateAI={() => {
      setMode('ai');
      window.electronAPI.invoke('set-ghost-mode', true);
      setPillVisible(true);
      setPillText('Study AI (Coding)');
      setPillDotColor('#9c27b0');
      addSystemMsg('✅ Study AI Assistant ready. Use Alt+Shift+S for a screenshot.');
    }} />;
  }

  const visibleMessages = messages.filter(m => m.role === 'assistant');
  const systemMsgs = messages.filter(m => m.role === 'system');
  const latestStatus = systemMsgs.length > 0 ? systemMsgs[systemMsgs.length - 1] : null;

  return (
    <OverlayWindow 
      screenshotCount={screenshots.length} 
      status={mode === 'ai' ? latestStatus?.content : ''}
      pillText={pillText}
      pillDotColor={pillDotColor}
      pillGlowing={pillGlowing}
      visible={pillVisible}
    >
      {mode === 'ai' && (
        <ChatPanel messages={visibleMessages} mode={mode} chatEndRef={chatEndRef} />
      )}
    </OverlayWindow>
  );
}
