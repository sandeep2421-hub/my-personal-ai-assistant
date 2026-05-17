import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const LICENSE_STORAGE_KEY = 'study_license_key';

/**
 * Validates a license key against Firestore and returns the OpenAI API key
 * stored by the admin.
 *
 * Firestore document structure (collection: "licenses", doc id: license key):
 *   - isActive: boolean
 *   - expiresAt: Timestamp (optional, omit for no expiry)
 *   - apiKey: string (OpenAI API key set by admin)
 *   - email: string (student identifier, optional)
 *   - createdAt: Timestamp
 */
export async function validateLicenseAndGetApiKey(key) {
  try {
    const licenseRef = doc(db, 'licenses', key);
    const snap = await getDoc(licenseRef);

    if (!snap.exists()) return { valid: false, apiKey: null };

    const data = snap.data();

    // Check active flag
    if (data.isActive !== true) return { valid: false, apiKey: null };

    // Check expiry (optional field)
    if (data.expiresAt) {
      const now = new Date();
      const expires = data.expiresAt.toDate();
      if (now > expires) return { valid: false, apiKey: null };
    }

    // Must have an API key set by admin
    if (!data.apiKey) {
      await logLoginEvent(key, false, 'Missing API Key');
      return { valid: false, apiKey: null };
    }

    // Update last seen (make it safe/optional so strict security rules don't block login)
    try {
      await updateDoc(licenseRef, {
        lastEndpoint: 'login',
        lastSeen: serverTimestamp()
      });
    } catch (writeError) {
      console.warn('Optional: Failed to update lastSeen in Firestore:', writeError);
    }

    // Log login event (make it safe/optional)
    try {
      await logLoginEvent(key, true, '');
    } catch (logError) {
      console.warn('Optional: Failed to write login log in Firestore:', logError);
    }

    return { valid: true, apiKey: data.apiKey };
  } catch (error) {
    console.error('License validation error:', error);
    return { valid: false, apiKey: null };
  }
}

async function logLoginEvent(key, isValid, errorMsg) {
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const { ip } = await ipRes.json();
    
    // hwid would come from electron, generating random mock for now if undefined
    const hwid = localStorage.getItem('study_hwid') || Math.random().toString(36).substring(2, 15);
    localStorage.setItem('study_hwid', hwid);

    const logRef = collection(db, `licenses/${key}/logs`);
    await addDoc(logRef, {
      detail: isValid ? "login successful" : "invalid license key",
      endpoint: "login",
      errorMsg: errorMsg,
      hwid: hwid,
      ip: ip,
      mode: "",
      provider: "",
      question: "",
      questionLen: 0,
      status: isValid ? "success" : "fail",
      ts: serverTimestamp()
    });
    
    // also update ip on user doc
    const licenseRef = doc(db, 'licenses', key);
    await updateDoc(licenseRef, {
      lastIp: ip
    });
  } catch (e) {
    console.error('Failed to log event', e);
  }
}

/**
 * Re-validates a previously saved license key (called on app start).
 */
export async function checkLicense() {
  const savedKey = localStorage.getItem(LICENSE_STORAGE_KEY);
  if (!savedKey) return false;
  const result = await validateLicenseAndGetApiKey(savedKey);
  if (result.valid) {
    localStorage.setItem('openai_api_key', result.apiKey);
  }
  return result.valid;
}

/** Persists license key to localStorage. */
export function saveLicense(key) {
  localStorage.setItem(LICENSE_STORAGE_KEY, key);
}

/** Clears license (for sign-out / revoke). */
export function clearLicense() {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
  localStorage.removeItem('openai_api_key');
}
