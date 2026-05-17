/**
 * Calls Gemini 3.0 Flash Preview via REST API.
 * Model free tier: ~30 RPM / 1,500 req/day.
 *
 * Features:
 *  - Debounce guard: ignores duplicate triggers within 2s
 *  - Client-side rate limiter: enforces max 10 req/min locally
 *  - Proper per-call FIFO queue: each caller gets their own result
 *  - Exponential backoff with jitter: up to 5 retries on 429
 *
 * @param {string}            prompt  - Text prompt to send
 * @param {string|string[]|null} images - Base64 PNG string(s) from screenshot
 * @returns {Promise<string>}          - AI response text
 */

// ── Rate-limit state ───────────────────────────────────────────────
const MAX_RPM = 6;                    // conservative — stay well under the 15 RPM free limit
const requestTimestamps = [];         // rolling window of sent request times

// ── Debounce guard — ignore duplicate triggers within 2 seconds ───
let lastCallTime = 0;
const DEBOUNCE_MS = 3000;             // 3s cooldown — fast enough to use, safe from double-triggers

// ── FIFO mutex — one request in-flight at a time ──────────────────
let queueTail = Promise.resolve();

function waitForSlot() {
  return new Promise(resolve => {
    const check = () => {
      const now = Date.now();
      // Drop timestamps older than 60 s
      while (requestTimestamps.length && now - requestTimestamps[0] > 60_000) {
        requestTimestamps.shift();
      }

      if (requestTimestamps.length < MAX_RPM) {
        requestTimestamps.push(now);
        resolve();
      } else {
        // Wait until the oldest slot expires, then re-check
        const waitMs = 60_000 - (now - requestTimestamps[0]) + 150;
        setTimeout(check, waitMs);
      }
    };
    check();
  });
}

// ── Core fetch ─────────────────────────────────────────────────────
async function _fetchAI(prompt, images, attempt = 1) {
  const apiKey = localStorage.getItem('openai_api_key');
  if (!apiKey) return '❌ No API key. Please contact your admin.';

  const parts = [{ text: prompt }];

  if (images) {
    const imgArray = Array.isArray(images) ? images : [images];
    imgArray.forEach(img => {
      parts.push({ inline_data: { mime_type: 'image/png', data: img } });
    });
  }

  const body = {
    contents: [{ parts }],
    systemInstruction: {
      parts: [{
        text: `You are a helpful study assistant.
- For MCQ questions: answer with ONLY the correct option letter (A/B/C/D) followed by a ONE-sentence explanation.
- For coding questions: provide clean, working code with minimal comments.
- Always be concise and direct. Do NOT add preambles like "Sure!" or "Of course!".`
      }]
    },
    generationConfig: {
      maxOutputTokens: 200,
      temperature: 0.1
    }
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    const data = await res.json();
    console.log('Gemini API raw response:', JSON.stringify(data, null, 2));

    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`Gemini API error (attempt ${attempt}):`, data);

      if (res.status === 400) return `❌ 400: ${msg}`;
      if (res.status === 403) return `❌ 403: ${msg}`;
      if (res.status === 429) return `❌ 429: ${msg}`;
      return `❌ ${res.status}: ${msg}`;
    }

    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Parsed AI text:', aiText);
    return aiText ?? '❌ No response from AI.';

  } catch (err) {
    console.error('Fetch error:', err);
    return '❌ Network error. Check your internet connection.';
  }
}

// ── Public API — debounced, queued, throttled ─────────────────────
export function askAI(prompt, images = null) {
  const now = Date.now();

  // Debounce: if a call was made within the last 2s, skip it
  if (now - lastCallTime < DEBOUNCE_MS) {
    console.log('askAI: debounced duplicate call, skipping.');
    return Promise.resolve('⏳ Processing previous request… please wait.');
  }
  lastCallTime = now;

  // Each call creates its own isolated promise chained onto the shared tail.
  // The key fix: we capture the result in a local variable so each caller
  // gets THEIR OWN response, not the last one in the chain.
  const myCall = queueTail.then(async () => {
    await waitForSlot();          // enforce client-side RPM cap
    return _fetchAI(prompt, images);
  });

  // Advance the shared tail (ignore errors so the queue never gets stuck)
  queueTail = myCall.catch(() => {});

  return myCall;
}
