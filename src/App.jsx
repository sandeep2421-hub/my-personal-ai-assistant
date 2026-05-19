import React, { useState, useEffect, useRef } from 'react';
import OverlayWindow from './components/OverlayWindow';
import LoginModal from './components/LoginModal';
import { askAI, askAICoding, askAIRefine } from './services/ai';
import { checkLicense, validateLicenseAndGetApiKey, saveLicense } from './services/license';

export default function App() {
  const [isLicensed, setIsLicensed]             = useState(null); // null = checking
  const [mode, setMode]                         = useState('main'); // 'main', 'ai'
  const [messages, setMessages]                 = useState([]);
  const [screenshots, setScreenshots]           = useState([]);
  const [pendingClipboardText, setPendingText]  = useState('');
  const [lastAIResponse, setLastAIResponse]     = useState('');

  // Pill and visibility states
  const [pillText, setPillText]                 = useState('VIT');
  const [pillDotColor, setPillDotColor]         = useState('#448aff');
  const [pillGlowing, setPillGlowing]           = useState(false);
  const [pillVisible, setPillVisible]           = useState(false); // MCQ starts completely hidden!

  const chatEndRef = useRef(null);

  // Refs for hotkeys (to prevent stale closure bugs)
  const modeRef = useRef(mode);
  const pendingTextRef = useRef(pendingClipboardText);
  const screenshotsRef = useRef(screenshots);
  const lastAIResponseRef = useRef(lastAIResponse);
  const messagesRef = useRef(messages);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { pendingTextRef.current = pendingClipboardText; }, [pendingClipboardText]);
  useEffect(() => { screenshotsRef.current = screenshots; }, [screenshots]);
  useEffect(() => { lastAIResponseRef.current = lastAIResponse; }, [lastAIResponse]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const getDefaultPillText = (m) => {
    return m === 'main' ? 'VIT' : 'VIT (Coding)';
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
      // Clear any stale cached API keys to force a fresh fetch from Firestore
      localStorage.removeItem('openai_api_keys');
      localStorage.removeItem('openai_api_key');

      // Check if there is a local apikey.txt containing one or more custom keys
      const localKey = await window.electronAPI.invoke('get-api-key');
      let localKeysArray = [];
      if (localKey) {
        localKeysArray = localKey.split(/[\r\n]+/)
          .map(k => k.trim())
          .filter(k => k.length > 0 && k.startsWith('AIzaSy'));
        if (localKeysArray.length > 0) {
          localStorage.setItem('openai_api_keys', JSON.stringify(localKeysArray));
          localStorage.setItem('openai_api_key', localKeysArray[0]);
          console.log(`🔑 Loaded ${localKeysArray.length} custom API keys successfully into rotation pool.`);
        }
      }

      const cliKey = await window.electronAPI.invoke('get-initial-license');
      if (cliKey) {
        const result = await validateLicenseAndGetApiKey(cliKey);
        if (result.valid) {
          saveLicense(cliKey);
          if (localKeysArray.length === 0) {
            localStorage.setItem('openai_api_key', result.apiKey);
            localStorage.setItem('openai_api_keys', JSON.stringify(result.apiKeys));
          }
          setIsLicensed(true);
          window.electronAPI.invoke('set-ghost-mode', true);
          return;
        }
      }

      const valid = await checkLicense();
      if (valid && localKeysArray.length > 0) {
        localStorage.setItem('openai_api_keys', JSON.stringify(localKeysArray));
        localStorage.setItem('openai_api_key', localKeysArray[0]);
      }
      setIsLicensed(valid);
      if (valid) {
        window.electronAPI.invoke('set-ghost-mode', true);
      }
    }
    verify();
  }, []);

  // ── Electron IPC listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLicensed) return;

    const api = window.electronAPI;

    // Screenshot captured
    api.on('capture-screenshot', async () => {
      const base64 = await api.invoke('take-screenshot');
      
      if (!base64) {
        setPillText('❌ Capture failed');
        setPillDotColor('#f44336');
        setPillVisible(true);
        setTimeout(() => {
          setPillVisible(false);
        }, 2000);
        return;
      }

      if (modeRef.current === 'ai') {
        // AI Mode: accumulate screenshots
        const updatedScreenshots = [...screenshotsRef.current, base64];
        setScreenshots(updatedScreenshots);
        
        setPillText(`📸 ${updatedScreenshots.length}`);
        setPillDotColor('#ab47bc'); // purple status dot
        setPillGlowing(true);
        setPillVisible(true);
        addSystemMsg(`📸 Screenshot #${updatedScreenshots.length} captured — press Alt+Shift+A to send`);
      } else {
        // MCQ Mode: process instantly
        setPillText('⏳ Thinking...');
        setPillDotColor('#ffca28');
        setPillVisible(true);

        const prompt = 'Look at this screenshot and answer the MCQ question shown. State ONLY the correct option letter (A/B/C/D). Do not write anything else.';
        
        setLastAIResponse('');
        api.invoke('set-last-ai-response', '');

        const systemInstructionText = `You are an expert academic exam solver. Solve the MCQ question in the screenshot. Return ONLY the single correct option letter (A, B, C, or D) followed by a ONE-sentence explanation. Do not add conversational text or code.`;

        askAI(prompt, [base64], 0.0, false, systemInstructionText).then(answer => {
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
          setPillDotColor('#00c853'); // green success dot
          setPillGlowing(true); // gold glow
          setPillVisible(true); // make visible!
          
          setLastAIResponse(cleanAnswer);
          api.invoke('set-last-ai-response', cleanAnswer);

          setTimeout(() => {
            setPillVisible(false);
            setPillGlowing(false);
          }, 4000); // vanish completely after 4 seconds
        });
      }
    });

    // Toggle Mode
    api.on('toggle-mode', () => {
      const nextMode = modeRef.current === 'main' ? 'ai' : 'main';
      setMode(nextMode);
      
      setPillText(nextMode === 'ai' ? 'Coding Mode' : 'MCQ Mode');
      setPillDotColor(nextMode === 'ai' ? '#ab47bc' : '#448aff'); // purple for AI, blue for MCQ
      setPillVisible(true);

      setTimeout(() => {
        setPillText(nextMode === 'ai' ? 'VIT (Coding)' : 'VIT');
        setPillVisible(false);
      }, 1500);
    });

    // Send to AI (AI Mode only)
    api.on('send-to-ai', async () => {
      if (modeRef.current !== 'ai') return;
      
      const currentScreenshots = screenshotsRef.current;
      if (currentScreenshots.length === 0) {
        setPillText('❌ No screenshots');
        setPillDotColor('#f44336');
        setPillVisible(true);
        setTimeout(() => {
          setPillVisible(false);
        }, 2000);
        return;
      }

      setPillText('⏳ Analyzing...');
      setPillDotColor('#ffca28');
      setPillVisible(true);

      setLastAIResponse('');
      api.invoke('set-last-ai-response', '');

      askAICoding(currentScreenshots, (stage) => {
        if (stage === 'analyzing') {
          setPillText('⏳ Analyzing...');
          setPillDotColor('#ffca28');
        } else if (stage === 'generating') {
          setPillText('⏳ Generating...');
          setPillDotColor('#ab47bc');
        }
      }).then(answer => {
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

        setPillText('✅ Success');
        setPillDotColor('#00c853'); // green success dot
        setPillGlowing(true);
        setPillVisible(true);
        
        setLastAIResponse(answer);
        api.invoke('set-last-ai-response', answer);
        addAIMsg(answer, true); // true = temporary message (expires after 12s)

        // Clear screenshots so they can start the next question
        setScreenshots([]);

        setTimeout(() => {
          setPillText('VIT (Coding)');
          setPillGlowing(false);
          setPillVisible(false);
        }, 4000);
      });
    });

    // Refine Code / Self-Correction (Alt+Shift+F)
    api.on('refine-code', async () => {
      if (modeRef.current !== 'ai') return;

      const previousCode = lastAIResponseRef.current;
      if (!previousCode) {
        setPillText('❌ No code to fix');
        setPillDotColor('#f44336');
        setPillVisible(true);
        setTimeout(() => {
          setPillVisible(false);
        }, 2000);
        return;
      }

      // Capture screenshot showing error/testcase failure
      setPillText('📸 Capturing...');
      setPillDotColor('#448aff');
      setPillVisible(true);

      const base64 = await api.invoke('take-screenshot');
      if (!base64) {
        setPillText('❌ Capture failed');
        setPillDotColor('#f44336');
        setPillVisible(true);
        setTimeout(() => {
          setPillVisible(false);
        }, 2000);
        return;
      }

      setPillText('⏳ Refining...');
      setPillDotColor('#ef5350');

      setLastAIResponse('');
      api.invoke('set-last-ai-response', '');

      askAIRefine(previousCode, [base64], (stage) => {
        if (stage === 'refining') {
          setPillText('⏳ Refining...');
          setPillDotColor('#ef5350');
        }
      }).then(answer => {
        const isError = typeof answer === 'string' && answer.startsWith('❌');
        if (isError) {
          setPillText('❌ Fix failed');
          setPillDotColor('#f44336');
          setPillVisible(true);
          setTimeout(() => {
            setPillVisible(false);
          }, 3000);
          return;
        }

        setPillText('✅ Fixed!');
        setPillDotColor('#00c853'); // green
        setPillGlowing(true);
        setPillVisible(true);

        setLastAIResponse(answer);
        api.invoke('set-last-ai-response', answer);
        addAIMsg(answer, true);

        // Automatically trigger auto-typing of corrected code!
        setTimeout(() => {
          setPillText('⌨️ Typing...');
          api.invoke('auto-type-code', answer);
        }, 1000);

        setTimeout(() => {
          setPillText('VIT (Coding)');
          setPillGlowing(false);
          setPillVisible(false);
        }, 5000);
      });
    });

    // Auto-Type Code trigger
    api.on('auto-type-code-trigger', () => {
      let code = lastAIResponseRef.current;
      if (!code) {
        // Fallback: search messages array for the last assistant message!
        const assistantMsgs = messagesRef.current.filter(m => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          code = assistantMsgs[assistantMsgs.length - 1].content;
        }
      }
      if (code) {
        api.invoke('auto-type-code', code);
      }
    });

    // Code Copied indicator
    api.on('code-copied', () => {
      setPillText('📋 Copied!');
      setPillDotColor('#00c853'); // green success dot
      setPillGlowing(true);
      setPillVisible(true);
      setTimeout(() => {
        setPillText(modeRef.current === 'ai' ? 'VIT (Coding)' : 'VIT');
        setPillGlowing(false);
        setPillVisible(false);
      }, 2000);
    });

    // Clear all
    api.on('clear-all', () => {
      setMessages([]);
      setScreenshots([]);
      setPendingText('');
      setLastAIResponse('');
      setPillText(modeRef.current === 'ai' ? 'VIT (Coding)' : 'VIT');
      setPillVisible(false);
    });

    // Clipboard paste from Neo browser
    api.on('clipboard-text', (text) => {
      if (!text || !text.trim()) {
        setPillText('❌ Clipboard empty');
        setPillDotColor('#f44336');
        setPillVisible(true);
        setTimeout(() => setPillVisible(false), 2000);
        return;
      }

      setPillText('📋 Copied to Chat');
      setPillDotColor('#00c853'); // green success
      setPillGlowing(true);
      setPillVisible(true);

      // Add user message with clipboard content
      addUserMsg(`📋 Text from browser:\n${text}`);
      
      if (modeRef.current === 'main') {
        setPillText('⏳ Thinking...');
        setPillDotColor('#ffca28');
        const prompt = 'Look at this question and answer the MCQ question shown. State ONLY the correct option letter (A/B/C/D). Do not write anything else.\n\nQuestion:\n' + text;
        askAI(prompt, []).then(answer => {
          const isError = typeof answer === 'string' && answer.startsWith('❌');
          if (isError) {
            setPillText('❌ Error');
            setPillDotColor('#f44336');
            setTimeout(() => setPillVisible(false), 3000);
            return;
          }
          let cleanAnswer = answer.trim();
          const match = cleanAnswer.match(/^[A-D]\b/i) || cleanAnswer.match(/\b[A-D]\b/i);
          if (match) cleanAnswer = match[0].toUpperCase();
          else cleanAnswer = cleanAnswer.replace(/[^A-Za-z]/g, '').substring(0, 1).toUpperCase() || 'A';

          setPillText(cleanAnswer);
          setPillDotColor('#00c853');
          setLastAIResponse(cleanAnswer);
          api.invoke('set-last-ai-response', cleanAnswer);
          setTimeout(() => {
            setPillVisible(false);
            setPillGlowing(false);
          }, 4000);
        });
      } else {
        addSystemMsg('📋 Clipboard text received as context. Press Alt+Shift+A to send to AI.');
        setTimeout(() => {
          setPillText('VIT (Coding)');
          setPillGlowing(false);
          setPillVisible(false);
        }, 2500);
      }
    });

    // Cleanup
    return () => {
      ['capture-screenshot', 'toggle-mode', 'send-to-ai', 'auto-type-code-trigger', 'clear-all', 'code-copied', 'refine-code', 'clipboard-text'].forEach(ch => api.off(ch));
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
    return <LoginModal onSuccess={() => {
      setIsLicensed(true);
      window.electronAPI.invoke('set-ghost-mode', true);
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
      {visibleMessages.map(msg => (
        <div 
          key={msg.id} 
          className="glass-overlay" 
          style={{ 
            padding: '12px 16px', 
            borderRadius: 12, 
            fontSize: '12px', 
            lineHeight: 1.4, 
            color: '#eceff1', 
            background: 'rgba(12, 14, 28, 0.9)', 
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            maxHeight: '220px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          {msg.content}
        </div>
      ))}
    </OverlayWindow>
  );
}
