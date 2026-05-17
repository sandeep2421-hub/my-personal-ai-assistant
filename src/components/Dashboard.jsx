import React from 'react';

export default function Dashboard({ onActivateAI }) {
  const cards = [
    { title: 'KERNEL CLOAK', desc: 'DEEP RING-ZERO OBFUSCATION.', icon: '🛡️' },
    { title: 'FOOTPRINT CLEAN', desc: 'NO FORENSIC DIGITAL TRACE.', icon: '🥾' },
    { title: 'INSTANT SYNC', desc: 'LOW LATENCY CLOUD ENGINE.', icon: '⚡' },
    { title: 'ZERO BANS', desc: 'UNTRACEABLE BY ALL PLATFORMS.', icon: '🚫' },
    { title: 'DOM-LESS AI', desc: 'WORKS OUTSIDE THE BROWSER.', icon: '🧠' },
    { title: 'REAL PROOF', desc: 'THOUSANDS OF VERIFIED WINS.', icon: '✔️' },
    { title: 'SYSTEM MASK', desc: 'HIDDEN FROM SYSTEM TRAY.', icon: '🎭' },
    { title: 'ACTIVITY MASK', desc: 'INVISIBLE TO TASK MANAGER.', icon: '🕵️' },
    { title: 'CLICK-THROUGH', desc: 'SEAMLESS WINDOW INTERACTION.', icon: '🖱️' },
    { title: 'GHOST NETWORK', desc: 'BYPASSES ADVANCED PACKET SNIFFING.', icon: '🌐' },
    { title: 'HARDWARE SPOOF', desc: 'DYNAMIC MAC & HWID ROTATION.', icon: '💻' },
    { title: 'MEMORY SHIELD', desc: 'PREVENTS RAM DUMP ANALYSIS.', icon: '💾' },
  ];

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      background: 'linear-gradient(to bottom, #111a12, #0d140e)',
      color: '#ffffff',
      overflowY: 'auto',
      fontFamily: 'system-ui, sans-serif',
      padding: '20px'
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '12px 20px',
        borderRadius: '30px',
        marginBottom: '30px',
        color: '#000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#00c853', color: '#fff', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            ⚡
          </div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>Engoulp</h1>
        </div>
        <button 
          onClick={onActivateAI}
          style={{
            background: '#00c853',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          AI Chat →
        </button>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            background: 'linear-gradient(145deg, #182816, #121c0e)',
            borderRadius: '24px',
            padding: '30px 20px',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            border: '1px solid rgba(0, 200, 83, 0.2)'
          }}>
            <div style={{
              width: '50px',
              height: '50px',
              borderRadius: '16px',
              border: '2px solid rgba(0, 200, 83, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              fontSize: '24px'
            }}>
              {c.icon}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 10px 0', letterSpacing: '0.5px' }}>
              {c.title}
            </h2>
            <p style={{ color: '#8a9b8e', fontSize: '12px', letterSpacing: '1px', fontWeight: 'bold', margin: '0 0 20px 0' }}>
              {c.desc}
            </p>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0 auto 20px auto', width: '80%' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', color: '#00c853', letterSpacing: '1px' }}>
              <div style={{ width: '6px', height: '6px', background: '#00c853', borderRadius: '50%', boxShadow: '0 0 10px #00c853' }}></div>
              ACTIVE
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
