// Popup showing AI-suggested fix for terminal errors

import { useState, useEffect } from 'react';
import { useErrorStore } from '../store/errorStore';
import { useTerminalStore } from '../store/terminalStore';
import { getAIFix, type FixSuggestion } from '../utils/aiFixSuggestion';
import { writeToPty } from '../utils/tauri';

export function QuickFixPopup() {
  const { 
    lastError, 
    suggestedFix, 
    isLoadingFix,
    setSuggestedFix,
    setLoadingFix,
    clearError 
  } = useErrorStore();
  
  const { tabs, activeTabId } = useTerminalStore();
  const [isOpen, setIsOpen] = useState(false);
  
  // Listen for fix request event
  useEffect(() => {
    const handler = async () => {
      if (!lastError) return;
      
      setIsOpen(true);
      setLoadingFix(true);
      
      try {
        const tab = tabs.find(t => t.id === activeTabId);
        const activePane = tab?.panes.find(p => p.id === tab.activePaneId);
        
        const fix = await getAIFix(
          lastError.command,
          lastError.output,
          {
            cwd: activePane?.cwd || '~',
            shell: 'zsh',
            os: 'macOS',
          }
        );
        
        setSuggestedFix(JSON.stringify(fix));
      } catch (error) {
        console.error('Failed to get fix:', error);
        setSuggestedFix(JSON.stringify({
          explanation: 'Failed to generate a suggestion. Please try again.',
          command: '',
          confidence: 'low',
        }));
      } finally {
        setLoadingFix(false);
      }
    };
    
    document.addEventListener('request-ai-fix', handler);
    return () => document.removeEventListener('request-ai-fix', handler);
  }, [lastError, setLoadingFix, setSuggestedFix, tabs, activeTabId]);
  
  if (!isOpen || !lastError) return null;
  
  const fix: FixSuggestion | null = suggestedFix ? JSON.parse(suggestedFix) : null;
  
  const handleRunCommand = async () => {
    if (!fix?.command || !activeTabId) return;
    
    const tab = tabs.find(t => t.id === activeTabId);
    const activePane = tab?.panes.find(p => p.id === tab.activePaneId);
    
    if (activePane?.ptyId) {
      await writeToPty(activePane.ptyId, fix.command + '\n');
      setIsOpen(false);
      clearError();
    }
  };
  
  const handleCopy = async () => {
    if (fix?.command) {
      await navigator.clipboard.writeText(fix.command);
    }
  };
  
  const handleClose = () => {
    setIsOpen(false);
    clearError();
  };
  
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          minWidth: 450,
          maxWidth: 600,
          color: 'var(--text-primary)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          animation: 'slideIn 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 24 }}>🛠️</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Quick Fix</span>
          <button
            onClick={handleClose}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 20,
              padding: 4,
              borderRadius: 4,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            ×
          </button>
        </div>
        
        {/* Loading state */}
        {isLoadingFix && (
          <div style={{ 
            padding: '40px 0',
            textAlign: 'center',
            color: 'var(--text-secondary)' 
          }}>
            <div style={{ marginBottom: 16, fontSize: 14 }}>
              Analyzing error...
            </div>
            <div style={{ 
              width: 40,
              height: 40,
              margin: '0 auto',
              border: '3px solid var(--border)',
              borderTop: '3px solid var(--accent)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        )}
        
        {/* Suggestion */}
        {!isLoadingFix && fix && (
          <>
            {/* Failed command */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 6,
                fontWeight: 600,
              }}>
                FAILED COMMAND
              </div>
              <code style={{
                display: 'block',
                background: 'var(--bg-tertiary)',
                padding: '10px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}>
                $ {lastError.command}
              </code>
            </div>
            
            {/* Explanation */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                background: 'var(--bg-tertiary)',
                padding: 12,
                borderRadius: 6,
                borderLeft: '3px solid var(--accent)',
              }}>
                {fix.explanation}
              </div>
            </div>
            
            {/* Suggested command */}
            {fix.command && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ 
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 600,
                }}>
                  SUGGESTED FIX
                  {fix.confidence === 'high' && (
                    <span style={{ 
                      fontSize: 10,
                      background: 'rgba(0, 255, 0, 0.15)',
                      color: '#4ade80',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontWeight: 600,
                    }}>
                      High confidence
                    </span>
                  )}
                  {fix.confidence === 'medium' && (
                    <span style={{ 
                      fontSize: 10,
                      background: 'rgba(255, 200, 0, 0.15)',
                      color: '#fbbf24',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontWeight: 600,
                    }}>
                      Medium confidence
                    </span>
                  )}
                </div>
                <code style={{
                  display: 'block',
                  background: 'rgba(var(--accent-rgb, 0, 122, 255), 0.1)',
                  color: 'var(--accent)',
                  padding: '10px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  border: '1px solid var(--accent)',
                  wordBreak: 'break-all',
                }}>
                  $ {fix.command}
                </code>
              </div>
            )}
            
            {/* Actions */}
            <div style={{ 
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end' 
            }}>
              <button
                onClick={handleCopy}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  padding: '10px 18px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                📋 Copy
              </button>
              {fix.command && (
                <button
                  onClick={handleRunCommand}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#000',
                    padding: '10px 18px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                  }}
                >
                  ▶️ Run Command
                </button>
              )}
            </div>
          </>
        )}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from {
            transform: scale(0.95) translateY(-20px);
            opacity: 0;
          }
          to {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
