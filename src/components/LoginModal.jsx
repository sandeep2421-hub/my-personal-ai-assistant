import React, { useState } from 'react';
import { validateLicenseAndGetApiKey, saveLicense } from '../services/license';

export default function LoginModal({ onSuccess }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) {
      setError('Please enter your license key.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await validateLicenseAndGetApiKey(key.trim());
      if (result.valid) {
        saveLicense(key.trim());
        localStorage.removeItem('openai_api_keys'); // Clear any stale cache
        localStorage.setItem('openai_api_key', result.apiKey);
        localStorage.setItem('openai_api_keys', JSON.stringify(result.apiKeys));
        onSuccess();
      } else {
        setError('Invalid or expired license key.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      console.error(err);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleActivate();
  };

  return (
    <div className="glass-overlay" style={{ width: 330, padding: '28px 24px', borderRadius: 16 }}>
      <div className="drag-handle" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18, background: 'none', borderBottom: 'none', height: 'auto', padding: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', textShadow: '0 0 10px rgba(255, 202, 40, 0.4)' }}>
          <span style={{ color: '#ffca28' }}>⚡</span> VIT
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12, color: '#90a4ae', textAlign: 'center', margin: '0 0 4px 0', lineHeight: 1.4, fontWeight: 500 }}>
          Enter your license key to activate
        </p>

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="License key"
            autoFocus
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              fontSize: 13,
              outline: 'none',
              textAlign: 'center',
              transition: 'all 0.2s',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)'
            }}
          />
        </div>

        <button
          onClick={handleActivate}
          disabled={loading}
          style={{
            borderRadius: 10,
            border: 'none',
            padding: '12px',
            background: 'linear-gradient(135deg, #7b1fa2, #4a148c)',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            transition: 'all 0.2s',
            width: '100%',
            boxShadow: '0 4px 12px rgba(123, 31, 162, 0.3)'
          }}
        >
          {loading ? '⏳ Activating...' : 'Activate'}
        </button>

        {error && (
          <p style={{ color: '#ff8a80', fontSize: 12, textAlign: 'center', margin: 0, fontWeight: 500 }}>
            {error}
          </p>
        )}

        <div style={{ fontSize: 10, color: '#546e7a', textAlign: 'center', marginTop: 4, fontStyle: 'italic', lineHeight: 1.3 }}>
          Binds to one PC. Keep a backup key.
        </div>
      </div>
    </div>
  );
}
