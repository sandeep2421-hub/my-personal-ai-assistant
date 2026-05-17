import React, { useState } from 'react';
import Draggable from 'react-draggable';

export default function OverlayWindow({ 
  children, 
  screenshotCount = 0, 
  status = '', 
  pillText = 'Study AI', 
  pillDotColor = '#448aff', 
  pillGlowing = false,
  visible = true
}) {
  const [opacity, setOpacity] = useState(0.92);

  return (
    <Draggable handle=".drag-handle">
      <div style={{ 
        position: 'absolute', 
        top: 20, 
        right: 20,
        display: visible ? 'block' : 'none',
        transition: 'all 0.3s ease'
      }}>
        {/* Tiny Pill */}
        <div
          className="glass-overlay drag-handle"
          style={{ 
            opacity, 
            width: 'fit-content', 
            minWidth: '60px', 
            height: '38px', 
            borderRadius: '19px', 
            display: 'flex', 
            alignItems: 'center',
            padding: '0 16px',
            background: pillGlowing ? 'rgba(50, 40, 10, 0.95)' : 'rgba(12, 14, 28, 0.75)',
            backdropFilter: 'blur(12px)',
            border: pillGlowing ? '1.5px solid rgba(255, 202, 40, 0.9)' : '1px solid rgba(255, 255, 255, 0.15)',
            cursor: 'move',
            boxShadow: pillGlowing ? '0 0 15px rgba(255, 202, 40, 0.5)' : '0 4px 16px rgba(0,0,0,0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: pillDotColor, 
              boxShadow: `0 0 8px ${pillDotColor}`,
              transition: 'all 0.3s ease',
              animation: pillText.startsWith('⏳') ? 'pulseGlow 1s ease infinite alternate' : 'none'
            }} />
            <span style={{ 
              fontSize: '14px', 
              fontWeight: '700', 
              color: pillGlowing ? '#ffca28' : '#e8eaf6', 
              letterSpacing: '0.2px',
              transition: 'all 0.3s ease',
              textShadow: pillGlowing ? '0 0 4px rgba(255, 202, 40, 0.3)' : 'none'
            }}>
              {pillText} {screenshotCount > 0 && `(📸 ${screenshotCount})`}
            </span>
          </div>
        </div>

        {/* Status line — only show if status is non-empty (for AI Mode status, etc.) */}
        {status && (
          <div style={{
            marginTop: '6px',
            padding: '6px 14px',
            background: 'rgba(12, 14, 28, 0.85)',
            backdropFilter: 'blur(10px)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px',
            color: '#b0bec5',
            maxWidth: '340px',
            wordBreak: 'break-word',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            {status}
          </div>
        )}

        {/* Floating Toasts container below the pill */}
        <div className="toasts-container" style={{ position: 'absolute', top: status ? '88px' : '48px', right: 0, width: '340px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {children}
        </div>
      </div>
    </Draggable>
  );
}
