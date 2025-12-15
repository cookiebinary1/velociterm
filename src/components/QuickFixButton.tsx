// Floating button that appears when an error is detected

import { useErrorStore } from '../store/errorStore';

export function QuickFixButton() {
  const { showFixButton, setShowFixButton } = useErrorStore();
  
  if (!showFixButton) return null;
  
  const handleClick = () => {
    setShowFixButton(false);
    // Trigger AI fix generation via custom event
    document.dispatchEvent(new CustomEvent('request-ai-fix'));
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 40, // Above status bar
        right: 20,
        zIndex: 1000,
        animation: 'slideInUp 0.3s ease-out',
      }}
    >
      <button
        onClick={handleClick}
        style={{
          background: 'var(--accent)',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
        }}
      >
        <span style={{ fontSize: 16 }}>🛠️</span>
        <span>Quick Fix</span>
        <span style={{ 
          fontSize: 11, 
          opacity: 0.7,
          fontWeight: 400,
          marginLeft: 4,
        }}>
          ⌘⇧A
        </span>
      </button>
      
      <style>{`
        @keyframes slideInUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
