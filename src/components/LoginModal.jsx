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
        localStorage.setItem('openai_api_key', result.apiKey);
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
    <div className="glass-overlay" style={{ width: 330, padding: '24px 20px', borderRadius: 16 }}>
      <div className="drag-handle" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, background: 'none', borderBottom: 'none', height: 'auto', padding: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#eceff1', letterSpacing: '0.3px' }}>
          📚 Study AI Assistant
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 11, color: '#90a4ae', textAlign: 'center', margin: '0 0 4px 0', lineHeight: 1.4 }}>
          Enter your license key to connect to the study helper engine.
        </p>

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="License Key (e.g. sandy)"
            autoFocus
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#ffffff',
              fontSize: 13,
              outline: 'none',
              textAlign: 'center',
              transition: 'all 0.2s'
            }}
          />
        </div>

        <button
          onClick={handleActivate}
          disabled={loading}
          style={{
            borderRadius: 10,
            border: 'none',
            padding: '11px',
            background: 'linear-gradient(135deg, #1e88e5, #1565c0)',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 0.2s',
            width: '100%'
          }}
        >
          {loading ? '⏳ Connecting...' : 'Connect'}
        </button>

        {error && (
          <p style={{ color: '#ef9a9a', fontSize: 12, textAlign: 'center', margin: 0, fontWeight: 500 }}>
            {error}
          </p>
        )}

        <div style={{ fontSize: 9, color: '#546e7a', textAlign: 'center', marginTop: 4 }}>
          Protected connection channel
        </div>
      </div>
    </div>
  );
}
