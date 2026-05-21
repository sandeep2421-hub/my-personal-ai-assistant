/**
 * VIT AI service — Gemini REST API with robust image handling.
 *
 * PIPELINE (3-step for first-try accuracy):
 *   Step 1 – ANALYZE  : Deep reasoning — constraints, algorithm, edge cases, test-case traces.
 *   Step 2 – GENERATE : Write the complete solution from the analysis.
 *   Step 3 – VERIFY   : AI reads its own code, re-traces every visible test case,
 *                        and returns a BUG-FREE corrected version (or confirms correct).
 *
 * This triple-pass approach eliminates the need to re-screenshot on errors.
 *
 * API keys are held in-memory only (never read from disk) and provided by the
 * in-memory store in license.js after successful Firebase authentication.
 */

import { getInMemoryApiKeys } from './license';

// ── Global state ───────────────────────────────────────────────────────────────
// Change this to your Cloudflare Worker URL if you set one up.
// Example: const PROXY_URL = 'https://my-proxy.my-workers.workers.dev';
const PROXY_URL = 'https://study-helper-api.kotasandeepkumar2006.workers.dev';

const MAX_RPM           = 10;
const requestTimestamps = [];
let currentKeyIndex     = 0;
const keyCooldowns      = {};

// ── Image helpers ──────────────────────────────────────────────────────────────
function stripDataUrl(raw) {
  return raw.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
}

function enforceByteCap(base64Str, capBytes) {
  // base64: 4 chars = 3 bytes  →  bytes ≈ length * 3/4
  const bytes = Math.floor(base64Str.length * 3 / 4);
  if (bytes > capBytes) {
    throw new Error(
      `Screenshot is ${(bytes / 1048576).toFixed(1)} MB — exceeds the ${(capBytes / 1048576).toFixed(1)} MB cap.`
    );
  }
}

function buildImageParts(images, maxBytesPerImage) {
  if (!images) return [];
  const list = Array.isArray(images) ? images : [images];
  const parts = [];
  for (const raw of list) {
    try {
      const stripped = stripDataUrl(raw);
      enforceByteCap(stripped, maxBytesPerImage);
      parts.push({ inline_data: { mime_type: 'image/png', data: stripped } });
    } catch (err) {
      throw new Error(`❌ Image encoding error: ${err.message}`);
    }
  }
  return parts;
}

// ── Key selection ──────────────────────────────────────────────────────────────
function selectNextAvailableKey(apiKeys) {
  const now = Date.now();
  let bestKey = null, bestIndex = -1, earliestCooldown = Infinity;

  for (let offset = 0; offset < apiKeys.length; offset++) {
    const idx    = (currentKeyIndex + offset) % apiKeys.length;
    const key    = apiKeys[idx];
    const expiry = keyCooldowns[key] || 0;

    if (expiry <= now) return { key, index: idx, waitMs: 0 };

    if (expiry < earliestCooldown) {
      earliestCooldown = expiry;
      bestKey = key;
      bestIndex = idx;
    }
  }
  return { key: bestKey, index: bestIndex, waitMs: Math.max(0, earliestCooldown - now) };
}

// ── Debounce guard ─────────────────────────────────────────────────────────────
let lastCallEpoch = 0;
const DEBOUNCE_MS = 3000;
function isDebounced() { return Date.now() - lastCallEpoch < DEBOUNCE_MS; }
function stampCall()   { lastCallEpoch = Date.now(); }

// ── RPM slot ──────────────────────────────────────────────────────────────────
function waitForSlot() {
  return new Promise(resolve => {
    const drain = () => {
      const now = Date.now();
      while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= 60_000)
        requestTimestamps.shift();
      if (requestTimestamps.length < Math.min(60, MAX_RPM * 3)) {
        requestTimestamps.push(now);
        resolve();
      } else {
        setTimeout(drain, Math.min(60_000 - (now - requestTimestamps[0]) + 200, 120_000));
      }
    };
    drain();
  });
}

// ── Core fetch ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 8;
const MAX_BYTES    = 8 * 1024 * 1024;

// Best → fallback model order. gemini-2.5-flash has built-in thinking = better accuracy.
const MODELS = [
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

async function _fetchAI(prompt, images, attempt, temp, sysInstruction) {
  // Load key pool from in-memory store only (never from localStorage/disk)
  const apiKeys = getInMemoryApiKeys();
  if (!apiKeys.length)
    return '\u274c No API keys available. Please authenticate first to load keys from the admin portal.';

  const { key, index, waitMs } = selectNextAvailableKey(apiKeys);
  if (waitMs > 50) await new Promise(r => setTimeout(r, waitMs));

  let imageParts = [];
  try {
    imageParts = buildImageParts(images, MAX_BYTES);
  } catch (err) {
    return err.message;
  }

  const sysText = sysInstruction ??
    `You are a helpful study assistant.
For MCQ: return the correct letter (A/B/C/D) first, then a 1-sentence explanation. Wrap the final answer in <final_answer>A - answer text</final_answer>.
For coding: return ONLY the code block — no preamble, no title, no explanation.`;

  const body = {
    contents:           [{ parts: [{ text: prompt }, ...imageParts] }],
    systemInstruction:  { parts: [{ text: sysText }] },
    generationConfig:   { maxOutputTokens: 8192, temperature: temp }
  };

  let lastError = '', lastStatus = '';
  const baseHost = PROXY_URL || 'https://generativelanguage.googleapis.com';
  
  for (const model of MODELS) {
    try {
      const url = `${baseHost}/v1beta/models/${model}:generateContent?key=${key}`;
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (answer) {
          currentKeyIndex = (index + 1) % apiKeys.length;
          return answer;
        }
        lastStatus = 'HTTP ' + res.status + ' — empty candidates';
      }

      lastError = data?.error?.message || ('HTTP ' + res.status);
      if (res.status === 429) {
        let retrySecs = 20;
        const retryInfo = (data?.error?.details || []).find(d => String(d['@type'] || '').includes('RetryInfo'));
        if (retryInfo?.retryDelay != null) retrySecs = Math.max(5, Math.ceil(parseFloat(retryInfo.retryDelay) || 20));
        keyCooldowns[key] = Date.now() + retrySecs * 1000 + 1000;
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!keyCooldowns[key]) keyCooldowns[key] = Date.now() + 5000;
  if (attempt < MAX_ATTEMPTS)
    return _fetchAI(prompt, images, attempt + 1, temp, sysInstruction);

  if (/quota|limit/i.test(lastError))
    return '❌ QUOTA EXCEEDED on all keys.\nTip: Create keys from DIFFERENT Google accounts to multiply quota.';

  return '❌ All keys/models failed after ' + attempt + ' attempts.\n' + (lastStatus || lastError);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function askAI(prompt, images, temp, bypassDebounce, systemInstructionText) {
  if (typeof temp !== 'number')            temp = 0.0;
  if (typeof bypassDebounce !== 'boolean') bypassDebounce = false;
  if (!bypassDebounce && isDebounced())
    return Promise.resolve('⏳ Processing previous request… please wait.');
  stampCall();
  return new Promise(resolve => {
    const run = async () => {
      await waitForSlot();
      resolve(await _fetchAI(prompt, images, 1, temp, systemInstructionText));
    };
    run();
  });
}

// ── Language detector ─────────────────────────────────────────────────────────
function detectLanguage(code) {
  if (!code || typeof code !== 'string') return 'C++';
  const c = code;
  if (c.includes('#include <stdio.h>') || c.includes('#include <conio.h>') ||
      (c.includes('printf(') && !c.includes('std::') && !c.includes('System.out') && !c.includes('Console.')))
    return 'C';
  if (c.includes('#include <iostream>') || c.includes('std::') || c.includes('vector<') ||
      c.includes('cout ') || c.includes('class Solution')) {
    return c.includes('System.out') ? 'Java' : 'C++';
  }
  if (c.includes('public class') || c.includes('import java.') || c.includes('System.out.print')) return 'Java';
  if (c.includes('using System;') || c.includes('namespace ') || c.includes('Console.Write'))     return 'C#';
  if (c.includes('def ') || (c.includes('print(') && !c.includes(';') && !c.includes('{')))       return 'Python';
  return 'C++';
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — ANALYZE
// Deep problem understanding before any code is written.
// ═══════════════════════════════════════════════════════════════════════════════
export async function askAIAnalyze(images, onProgress) {
  if (onProgress) onProgress('analyzing');

  const prompt =
`You are a world-class competitive programmer (ICPC World Finalist, Codeforces Grandmaster).
Examine EVERY screenshot carefully. Extract ALL visible text: problem statement, constraints, function signature, sample inputs, sample outputs, and any visible code skeleton or starter file.

Produce a rigorous analysis with these EXACT sections:

LANGUAGE & SIGNATURE
- Exact programming language (look at the editor tab, file extension, starter code).
- Exact function/class name and parameter types as shown.
- Return type.
- I/O format (stdin/stdout vs function return).

CONSTRAINTS
- All constraint bounds (n, array sizes, value ranges, time limit, memory limit).
- Derived limits: max possible value of expressions that might overflow 32-bit int.

ALGORITHM SELECTION
- Best algorithm and data structure for this problem.
- Time complexity and why it fits within the time limit.
- Space complexity.
- Why simpler/naive approaches fail (or succeed if constraints are small).

STEP-BY-STEP LOGIC
- Pseudocode-level walkthrough of the algorithm.
- Every non-trivial step explained.

TEST CASE TRACES
- Manually trace EVERY sample input through your algorithm step by step.
- Show intermediate values, confirm the output matches the expected output.
- If any trace fails, revise the algorithm.

EDGE CASES
- Empty input, n=0, n=1.
- All same values, sorted ascending, sorted descending.
- Maximum-N stress test (do not skip this — state explicitly if it passes).
- Integer overflow risk and mitigation.
- Off-by-one risks.

Do NOT write any code. Output analysis text only.`;

  const sysInst =
`You are a Grandmaster-level competitive programmer doing rigorous problem analysis.
Your analysis must be thorough enough that a junior programmer can implement a correct solution from it alone.
No code. No markdown code blocks. Analysis text only.`;

  return askAI(prompt, images, 0, true, sysInst);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — GENERATE
// Write the complete solution based on the analysis.
// ═══════════════════════════════════════════════════════════════════════════════
export async function askAIGenerate(analysis, images, onProgress) {
  if (onProgress) onProgress('generating');

  const prompt =
`PROBLEM ANALYSIS (produced in Step 1):
===
${analysis}
===

ORIGINAL SCREENSHOTS are attached so you can see the exact editor skeleton, function signature, and sample I/O.

Your task: Implement the COMPLETE, COMPILABLE, CORRECT solution.

STRICT RULES — follow every single one:
1. Output a SINGLE markdown code block. Nothing before it. Nothing after it.
2. Use the EXACT language shown in the editor (look at the file tab, extension, starter code).
3. Match the EXACT function signature / class name / method name from the starter code or problem.
4. Include ALL required headers/imports so the file compiles as a standalone file.
5. Use long long (C/C++), long (Java), or equivalent 64-bit type wherever overflow is possible (any multiplication or sum of values > 10^4).
6. Use fast I/O (ios::sync_with_stdio(false); cin.tie(nullptr);) for C++ if N > 10^4.
7. ZERO global or static variables — all state must be local to main() or the called function.
8. ZERO comments — clean production code only.
9. Handle ALL edge cases identified in the analysis.
10. Before finalizing, mentally re-trace each sample test case through your code and confirm correctness.`;

  const sysInst =
`You are a master software engineer at a FAANG company writing contest-winning code.
Output ONLY the final correct solution in a single markdown code block.
No preamble. No explanation. No comments. The code must compile and pass all test cases on the first submission.`;

  return askAI(prompt, images, 0, true, sysInst);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — SELF-VERIFY & FIX
// AI reviews its own code against the problem, traces test cases, and fixes bugs.
// This is the key step that eliminates the need to re-screenshot on errors.
// ═══════════════════════════════════════════════════════════════════════════════
async function askAIVerify(code, analysis, images, onProgress) {
  if (onProgress) onProgress('verifying');

  const lang = detectLanguage(code);

  const prompt =
`You are doing a CRITICAL code review of this ${lang} solution before it is submitted.

PROBLEM ANALYSIS:
===
${analysis}
===

GENERATED CODE TO REVIEW:
\`\`\`
${code}
\`\`\`

The original problem screenshots are attached so you can verify against the exact sample inputs/outputs.

Perform this EXACT verification process:

STEP A — COMPILE CHECK
- Check for any syntax errors, missing headers, undeclared variables.
- Check that all required headers/imports are present.
- Check that the function/class signature exactly matches the problem/skeleton.

STEP B — LOGIC CHECK  
- Re-read the algorithm. Is the logic correct for the stated approach?
- Any off-by-one errors in loops?
- Any wrong comparison operators (< vs <=)?
- Array index out of bounds risk?
- Integer overflow? (Any 32-bit int used where values could exceed 2^31?)
- Uninitialized variables?

STEP C — TEST CASE EXECUTION
- For EVERY sample input shown in the screenshots, simulate the code execution step by step.
- Write out intermediate variable values.
- State the computed output and compare to expected output.
- If ANY test case fails, identify the exact bug.

STEP D — EDGE CASE CHECK
- n=0 or empty input — does the code crash or return wrong answer?
- n=1 — correct?
- All same values — correct?

STEP E — VERDICT & OUTPUT
If the code is CORRECT (all test cases pass, no bugs found):
  - Output only the fixed/original code block unchanged.
If ANY bug was found:
  - Fix EVERY bug found.
  - Output ONLY the corrected complete code block.

OUTPUT FORMAT: A single markdown code block containing the final (possibly corrected) code. Nothing else.`;

  const sysInst =
`You are a principal engineer doing final pre-submission code review.
Your goal: ensure the code is 100% correct before it is submitted.
Find every bug, fix it, and return ONLY the final corrected code block.
If the code is already correct, return it unchanged as a code block.
No explanations. No comments. Code block only.`;

  return askAI(prompt, images, 0, true, sysInst);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Full 3-step pipeline — analyze → generate → self-verify
// ═══════════════════════════════════════════════════════════════════════════════
export async function askAICoding(images, onProgress) {
  // Step 1: Deep analysis
  const analysis = await askAIAnalyze(images, onProgress);
  if (typeof analysis === 'string' && analysis.startsWith('❌')) return analysis;

  // Step 2: Generate code from analysis
  const rawCode = await askAIGenerate(analysis, images, onProgress);
  if (typeof rawCode === 'string' && rawCode.startsWith('❌')) return rawCode;

  // Step 3: Self-verify and auto-fix before returning
  const verifiedCode = await askAIVerify(rawCode, analysis, images, onProgress);
  if (typeof verifiedCode === 'string' && verifiedCode.startsWith('❌')) {
    // If verify step failed (API error), still return the generated code
    return rawCode;
  }

  return verifiedCode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Self-correction — fix failed code given an error screenshot.
// ═══════════════════════════════════════════════════════════════════════════════
export async function askAIRefine(previousCode, images, onProgress) {
  if (onProgress) onProgress('refining');

  const lang = detectLanguage(previousCode);

  const prompt =
`This ${lang} code FAILED (wrong output or compile error). The screenshot shows the exact error message or wrong output.

FAILED CODE:
\`\`\`
${previousCode}
\`\`\`

YOUR TASK — follow this process:
1. READ the error message / wrong output in the screenshot carefully.
2. IDENTIFY the root cause of the failure (not just symptoms).
3. FIX every bug — do not just patch the symptom, fix the underlying logic if needed.
4. VERIFY your fix by mentally tracing every visible sample test case through the corrected code.
5. OUTPUT only the complete corrected ${lang} code block.

RULES:
- Same language ONLY: ${lang}.
- Match the EXACT function signature / class from the problem.
- All required headers/imports included.
- No global or static variables.
- No comments. No explanations. ONLY the code block.`;

  const sysInst =
`You are a debugging expert.
Read the error/failure screenshot, find the root cause, fix it completely, and output ONLY the corrected compilable ${lang} code block.
No comments. No conversational text. Code only.`;

  return askAI(prompt, images, 0, true, sysInst);
}
