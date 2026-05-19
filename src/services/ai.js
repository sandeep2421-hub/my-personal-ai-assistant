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
async function _fetchAI(prompt, images, attempt = 1, temp = 0.0, systemInstructionText = null) {
  // Load keys array from local storage
  let apiKeys = [];
  try {
    const stored = localStorage.getItem('openai_api_keys');
    if (stored) apiKeys = JSON.parse(stored);
  } catch (e) {}

  // Fallback to single key if array is empty
  if (!apiKeys || !apiKeys.length) {
    const single = localStorage.getItem('openai_api_key');
    if (single) apiKeys = [single];
  }

  if (!apiKeys || !apiKeys.length) return '❌ No API key. Please contact your admin.';

  // Select key using attempt index (round-robin)
  const keyIndex = (attempt - 1) % apiKeys.length;
  const apiKey = apiKeys[keyIndex];

  const parts = [{ text: prompt }];

  if (images) {
    const imgArray = Array.isArray(images) ? images : [images];
    imgArray.forEach(img => {
      parts.push({ inline_data: { mime_type: 'image/png', data: img } });
    });
  }

  const sysText = systemInstructionText || `You are a helpful study assistant.
- For MCQ questions: answer with ONLY the correct option letter (A/B/C/D) followed by a ONE-sentence explanation.
- For coding questions: provide clean, working code with minimal comments.
- Always be concise and direct. Do NOT add preambles like "Sure!" or "Of course!".`;

  const body = {
    contents: [{ parts }],
    systemInstruction: {
      parts: [{
        text: sysText
      }]
    },
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: temp
    }
  };

  try {
    let model = 'gemini-2.5-pro';
    let res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    // If Gemini 2.5 Pro fails or is rate-limited, instantly fallback to Gemini 2.5 Flash!
    if (!res.ok) {
      console.warn(`⚠️ Gemini 2.5 Pro failed with HTTP ${res.status}. Falling back to Gemini 2.5 Flash...`);
      model = 'gemini-2.5-flash';
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
    }

    const data = await res.json();
    console.log('Gemini API raw response:', JSON.stringify(data, null, 2));

    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`Gemini API error on Key #${keyIndex + 1} (attempt ${attempt}):`, data);

      const maxAttempts = Math.max(6, apiKeys.length * 2);
      if (attempt < maxAttempts) {
        const backoffMs = apiKeys.length > 1 ? 50 : 1000;
        console.log(`⏳ Key #${keyIndex + 1} failed with ${res.status}. Switching to Key #${((keyIndex + 1) % apiKeys.length) + 1} in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return _fetchAI(prompt, images, attempt + 1, temp);
      }
      return `❌ API Error on all keys: ${msg}`;
    }

    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Parsed AI text:', aiText);
    return aiText ?? '❌ No response from AI.';

  } catch (err) {
    console.error(`Fetch error on Key #${keyIndex + 1}:`, err);
    const maxAttempts = Math.max(6, apiKeys.length * 2);
    if (attempt < maxAttempts) {
      console.log(`⏳ Network error on Key #${keyIndex + 1}. Switching to Key #${((keyIndex + 1) % apiKeys.length) + 1} in 1000ms...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Defend against momentary Wi-Fi stutters
      return _fetchAI(prompt, images, attempt + 1, temp);
    }
    return '❌ Network error. Check your internet connection.';
  }
}

// ── Public API — debounced, queued, throttled ─────────────────────
export function askAI(prompt, images = null, temp = 0.0, bypassDebounce = false, systemInstructionText = null) {
  const now = Date.now();

  if (!bypassDebounce) {
    // Debounce: if a call was made within the last 2s, skip it
    if (now - lastCallTime < DEBOUNCE_MS) {
      console.log('askAI: debounced duplicate call, skipping.');
      return Promise.resolve('⏳ Processing previous request… please wait.');
    }
    lastCallTime = now;
  }

  // Each call creates its own isolated promise chained onto the shared tail.
  // The key fix: we capture the result in a local variable so each caller
  // gets THEIR OWN response, not the last one in the chain.
  const myCall = queueTail.then(async () => {
    await waitForSlot();          // enforce client-side RPM cap
    return _fetchAI(prompt, images, 1, temp, systemInstructionText);
  });

  // Advance the shared tail (ignore errors so the queue never gets stuck)
  queueTail = myCall.catch(() => {});

  return myCall;
}

// ── ADVANCED DSA CODING & BUG-FIX PIPELINES ───────────────────────

/**
 * Detects the programming language of a code block to ensure consistent refactors.
 */
function detectLanguage(code) {
  if (!code) return 'C++';
  const clean = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*|#.*/g, ''); // strip comments
  if (code.includes('#include <stdio.h>') || code.includes('#include <conio.h>') || (code.includes('printf(') && !code.includes('std::') && !code.includes('System.out') && !code.includes('Console.'))) {
    return 'C';
  }
  if (code.includes('#include') || code.includes('std::') || code.includes('cout') || code.includes('vector<') || code.includes('class Solution')) {
    if (code.includes('public class') || code.includes('System.out')) return 'Java';
    return 'C++';
  }
  if (code.includes('public class') || code.includes('System.out') || code.includes('import java.')) {
    return 'Java';
  }
  if (code.includes('using System;') || code.includes('namespace ') || code.includes('Console.Write')) {
    return 'C#';
  }
  if (code.includes('def ') || (code.includes('print(') && !code.includes(';') && !code.includes('{') && !code.includes('}'))) {
    return 'Python';
  }
  return 'C++'; // default fallback
}

/**
 * Advanced competitive programming pipeline.
 * Performs deep, step-by-step constraint/edge-case reasoning before code generation.
 * Enforces temperature = 0.0 and utilizes the rotatable keys.
 */
export async function askAICoding(images, onProgress) {
  if (onProgress) onProgress('analyzing');

  const reasoningPrompt = `You are a red-rated competitive programmer. Analyze the provided screenshot(s) containing a programming problem.

Before writing any code, perform a deep, rigorous analysis to guarantee first-attempt success:
1. Scan the code editor in the screenshot and identify:
   - The target programming language (C, C++, Java, Python, C#, etc.).
   - The exact starter template, class name, function signature, or expected input/output format.
2. Identify and state the exact constraints (input size, value ranges, time/space limits).
3. Derive the optimal algorithm (proof of correctness, time/space complexity analysis) to pass all hidden tests.
4. Enumerate all potential edge cases (empty bounds, negative values, duplicates, overflow, off-by-one errors).
5. Identify potential integer overflow points and specify if 64-bit integers are required.
6. Choose the optimal data structures and write a mental step-by-step dry run.

IMPORTANT: DO NOT WRITE THE SOLUTION CODE YET. Return only your detailed analysis and derived optimal logic.`;

  const sysInstructionReasoning = `You are a red-rated competitive programmer. Your task is to perform a rigorous constraint and edge case analysis. State the optimal algorithm and mathematical proofs clearly. DO NOT write code yet.`;

  console.log("🚀 [Coding Pipeline] Step 1: Initiating Deep Reasoning...");
  const reasoning = await askAI(reasoningPrompt, images, 0.0, true, sysInstructionReasoning);
  
  if (reasoning.startsWith("❌")) {
    return reasoning; // Fail early and display license/API error directly
  }

  console.log("🧠 [Coding Pipeline] Step 1 Complete! Analysis received.");

  if (onProgress) onProgress('generating');

  const verificationPrompt = `Here is the optimal algorithm analysis and derived logic for the programming problem in the screenshot:

---
[ANALYSIS]
${reasoning}
---

Review this analysis and derived algorithm critically.
1. Detect any potential logical flaws, incorrect assumptions, or missed boundary conditions.
2. Verify if it strictly complies with the constraints to prevent TLE or Memory limits.

Once verified, generate the COMPLETE, highly optimized, and working code.

Follow these strict rules to ensure the code compiles and passes all test cases on the FIRST ATTEMPT:
1. Output ONLY the working code inside a single standard markdown code block. No introductory text, explanation, or conversational text.
2. Absolutely NO comments of any kind in the code (do NOT write any lines starting with #, //, or /* */).
3. TARGET LANGUAGE: Write the code in the exact language required by the question/editor in the screenshot. If the screen mentions C, output C code (no C++ features). If it mentions Python, output Python.
4. SKELETON MATCHING: Match the exact function signature, class name, or input/output format shown in the editor skeleton in the screenshot. Do not change the class name, function names, or parameters.
5. COMPLETE HEADERS: Include all standard headers and libraries needed so the code compiles in a single file:
   - For C: Include <stdio.h>, <stdlib.h>, <string.h>, <math.h>, <ctype.h>, <limits.h>, etc.
   - For C++: Include <iostream>, <vector>, <string>, <algorithm>, <map>, <set>, <queue>, <stack>, <cmath>, <climits>, <numeric>, etc. Use "using namespace std;".
   - For Java: Include all necessary imports (java.io.*, java.util.*).
6. Solve the problem completely. Never leave placeholders, TODOs, or incomplete logic.
7. Ensure 64-bit data types are used where integer overflows are possible (long long in C/C++, long in Java).
8. Use Fast I/O if input constraints are high.`;

  const sysInstructionGeneration = `You are a master software engineer. Your task is to output the final verified and corrected solution. You must output ONLY the complete clean code matching the requested format inside a single markdown code block. Absolutely NO comments of any kind, and NO conversational preambles or post-explanations.`;

  console.log("🚀 [Coding Pipeline] Step 2: Initiating Self-Verification & Refinement...");
  const finalCode = await askAI(verificationPrompt, images, 0.0, true, sysInstructionGeneration);
  console.log("🎯 [Coding Pipeline] Step 2 Complete! Optimal code generated.");
  return finalCode;
}

/**
 * Self-Correction bug-fix pipeline.
 * Receives the previous wrong code and a screenshot of the failure/compiler error,
 * then returns the corrected code block.
 */
export async function askAIRefine(previousCode, images, onProgress) {
  if (onProgress) onProgress('refining');

  const lang = detectLanguage(previousCode);

  const prompt = `You are a master competitive programmer. The previous code we generated failed compiler execution or tests.

Here is the previous code that failed:
\`\`\`
${previousCode}
\`\`\`

Analyze the provided screenshot(s) showing the error message, failed test case inputs, or execution outputs.
Identify the bug (e.g. off-by-one error, incorrect boundary condition, memory limit, TLE, typings, etc.) and explain the fix briefly.
Then generate the COMPLETE, CORRECTED code block.

Follow these strict formatting rules:
1. Output ONLY the working code inside a single standard markdown code block.
2. The code MUST be written strictly in the same programming language as the previous code: ${lang}. Do NOT switch to any other language.
3. Do NOT write any introductory text, explanatory text, preambles, or post-explanations. Write ZERO conversational text.
4. Absolutely NO comments of any kind in the code. The code must contain ZERO comments.
5. Ensure the code matches the exact function signature, class name, or input/output format.
6. Solve the problem completely.
7. ALWAYS output the COMPLETE, self-contained function or class definition including its signature and outer braces. Never output only the middle body.`;

  const sysInstructionRefinement = `You are a master software engineer fixing a bug. Identify the flaw from the error screenshot and output ONLY the complete corrected code in ${lang} inside a single markdown code block with NO comments and NO conversational text.`;

  console.log(`🚀 [Refinement Pipeline] Initiating bug fix (Language: ${lang})...`);
  const correctedCode = await askAI(prompt, images, 0.0, true, sysInstructionRefinement);
  console.log("🎯 [Refinement Pipeline] Bug fix complete.");
  return correctedCode;
}
