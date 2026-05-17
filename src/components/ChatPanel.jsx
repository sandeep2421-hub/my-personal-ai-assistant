import React from 'react';

export default function ChatPanel({ messages, mode, chatEndRef }) {
    return (
    <div className="chat-panel" style={{ padding: 0, overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      {/* Messages as floating toasts */}
      {messages.map((msg, idx) => (
        <div 
          key={msg.id ?? idx} 
          className={`message-bubble ${msg.role}`}
          style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.25s ease' }}
        >
          <div className={`bubble-inner ${msg.role}${msg.isTemporary ? ' temporary' : ''}`} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}>
            {msg.role === 'system' && '🔔 '}
            {msg.content}
            {msg.images && msg.images.length > 0 && (
              <div style={{ fontSize: 10, color: '#78909c', marginTop: 4 }}>
                📷 {msg.images.length} screenshot(s) attached
              </div>
            )}
            {msg.isTemporary && (
              <div style={{ fontSize: 10, color: '#ffa726', marginTop: 4 }}>
                ⏱ Vanishes in 4s
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );
}
