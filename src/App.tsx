import { useEffect, useCallback, useRef, useState } from 'react';
import { SearchAddon } from '@xterm/addon-search';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TitleBar } from './components/TitleBar';
import { Terminal } from './components/Terminal';
import { SplitPane } from './components/SplitPane';
import { Settings } from './components/Settings';
import { CommandPalette } from './components/CommandPalette';
import { StatusBar } from './components/StatusBar';
import { SearchBar } from './components/SearchBar';
import { QuickFixButton } from './components/QuickFixButton';
import { QuickFixPopup } from './components/QuickFixPopup';
import { useTerminalStore, type LayoutNode } from './store/terminalStore';
import { useSettingsStore } from './store/settingsStore';
import { matchKeyBinding } from './utils/keybindings';
import { confirmClose, confirmExit, getHomeDir, killPty, loadConfig, newWindow, saveConfig, scpDownload, writeToPty } from './utils/tauri';
import { getTheme } from './themes';
import './index.css';

import { revealItemInDir } from '@tauri-apps/plugin-opener';

function App() {
  const { tabs, activeTabId, addTab, setActiveTab, setActivePane, splitVertical, splitHorizontal, adjustPaneFontSize, resetPaneFontSize } = useTerminalStore();
  const { settings, setSettings, isSettingsOpen, isCommandPaletteOpen, toggleSettings, openSettings, toggleCommandPalette } = useSettingsStore();
  const [showSearch, setShowSearch] = useState(false);
  const [isQuitConfirmOpen, setIsQuitConfirmOpen] = useState(false);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const configLoadedRef = useRef(false);
  const theme = getTheme(settings.theme);
  const isMac = typeof navigator !== 'undefined' && /Macintosh/i.test(navigator.userAgent);

  // Load config on startup
  useEffect(() => {
    loadConfig().then((config) => {
      setSettings({
        opacity: config.opacity,
        blur: config.blur,
        blurRadius: config.blur_radius ?? 10,
        fontSize: config.font_size,
        fontFamily: config.font_family,
        theme: config.theme,
        scrollback: config.scrollback,
        cursorStyle: config.cursor_style as 'block' | 'underline' | 'bar',
        cursorBlink: config.cursor_blink,
        predictiveInput: config.predictive_input ?? true,
        bellEnabled: config.bell_enabled ?? true,
        confirmCmdQ: config.confirm_cmd_q ?? true,
      });
      configLoadedRef.current = true;
    }).catch(console.error);
  }, [setSettings]);

  useEffect(() => {
    if (!configLoadedRef.current) return;
    const t = window.setTimeout(() => {
      saveConfig({
        opacity: settings.opacity,
        blur: settings.blur,
        blur_radius: settings.blurRadius,
        font_size: settings.fontSize,
        font_family: settings.fontFamily,
        theme: settings.theme,
        scrollback: settings.scrollback,
        cursor_style: settings.cursorStyle,
        cursor_blink: settings.cursorBlink,
        predictive_input: settings.predictiveInput,
        bell_enabled: settings.bellEnabled,
        confirm_cmd_q: settings.confirmCmdQ,
      }).catch((error) => {
        console.error('Failed to auto-save config:', error);
      });
    }, 500);

    return () => window.clearTimeout(t);
  }, [
    settings.opacity,
    settings.blur,
    settings.blurRadius,
    settings.fontSize,
    settings.fontFamily,
    settings.theme,
    settings.scrollback,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.predictiveInput,
    settings.bellEnabled,
    settings.confirmCmdQ,
  ]);

  // Create initial tab
  useEffect(() => {
    if (tabs.length === 0) {
      createNewTab();
    }
  }, []);

  const createNewTab = useCallback(async () => {
    const homeDir = await getHomeDir().catch(() => '~');
    const id = crypto.randomUUID();
    const paneId = crypto.randomUUID();
    addTab({
      id,
      title: 'Terminal',
      panes: [{ id: paneId, ptyId: null, cwd: homeDir }],
      activePaneId: paneId,
      layout: { type: 'pane', paneId },
    });
  }, [addTab]);

  const renderLayout = useCallback((tabId: string, node: LayoutNode) => {
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    if (node.type === 'pane') {
      const pane = tab.panes.find((p) => p.id === node.paneId);
      if (!pane) return null;
      const paneIsActive = tabId === activeTabId && pane.id === tab.activePaneId;

      return (
        <div
          key={pane.id}
          className={`terminal-pane ${paneIsActive ? 'active' : ''}`}
          onMouseDown={() => setActivePane(tabId, pane.id)}
          style={{ height: '100%' }}
        >
          <Terminal
            tabId={tabId}
            paneId={pane.id}
            isActive={paneIsActive}
            searchAddonRef={searchAddonRef}
            fontSizeOffset={pane.fontSizeOffset ?? 0}
          />
        </div>
      );
    }

    return (
      <SplitPane direction={node.direction}>
        {node.children.map((child) => renderLayout(tabId, child))}
      </SplitPane>
    );
  }, [activeTabId, setActivePane]);

  const closeCurrentPane = useCallback(async () => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const activePane = tab.panes.find((p) => p.id === tab.activePaneId);
    if (!activePane) return;

    if (activePane.ptyId) {
      await killPty(activePane.ptyId);
    }

    useTerminalStore.getState().removePane(tab.id, activePane.id);
  }, [activeTabId, tabs]);

  const navigateTabs = useCallback((direction: 'prev' | 'next') => {
    if (tabs.length < 2 || !activeTabId) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0) newIndex = tabs.length - 1;
    if (newIndex >= tabs.length) newIndex = 0;
    setActiveTab(tabs[newIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const clearTerminal = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const activePane = tab?.panes.find((p) => p.id === tab.activePaneId);
    if (activePane?.ptyId) {
      import('./utils/tauri').then(({ writeToPty }) => {
        writeToPty(activePane.ptyId!, 'clear\n');
      });
    }
  }, [activeTabId, tabs]);

  const handleScpDownload = useCallback(async () => {
    const remote = window.prompt('Download via SCP\n\nExample: user@host:/path/to/file.txt', '');
    if (!remote) return;

    try {
      const dest = await scpDownload(remote);
      await revealItemInDir(dest);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`SCP download failed:\n\n${msg}`);
    }
  }, []);

  const changeFontSize = useCallback((delta: number) => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && tab.activePaneId) {
      adjustPaneFontSize(tab.id, tab.activePaneId, delta);
    }
  }, [tabs, activeTabId, adjustPaneFontSize]);

  const resetFontSize = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && tab.activePaneId) {
      resetPaneFontSize(tab.id, tab.activePaneId);
    }
  }, [tabs, activeTabId, resetPaneFontSize]);

  const requestExit = useCallback(async () => {
    if (!settings.confirmCmdQ) {
      await confirmExit();
      return;
    }
    setIsQuitConfirmOpen(true);
  }, [settings.confirmCmdQ]);

  const confirmQuit = useCallback(async () => {
    setIsQuitConfirmOpen(false);
    await confirmExit();
  }, []);

  const cancelQuit = useCallback(() => {
    setIsQuitConfirmOpen(false);
  }, []);

  const handleClose = useCallback(async () => {
    await confirmClose();
  }, []);

  // Listen for close-requested event from Tauri (window close button)
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen('close-requested', () => {
      handleClose();
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, [handleClose]);

  // Listen for exit-requested event from Tauri (Cmd+Q)
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen('exit-requested', () => {
      requestExit();
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, [requestExit]);

  // Native menu Paste (Cmd+V) -> paste clipboard into active PTY
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.listen('menu-paste', async () => {
      const { tabs, activeTabId } = useTerminalStore.getState();
      if (!activeTabId) return;

      const tab = tabs.find((t) => t.id === activeTabId);
      const activePane = tab?.panes.find((p) => p.id === tab.activePaneId);
      if (!activePane?.ptyId) return;

      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        await writeToPty(activePane.ptyId, text);
      } catch (err) {
        console.error('Failed to paste from clipboard:', err);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Menu event listeners
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(win.listen('menu-new-tab', () => createNewTab()));
    unlisteners.push(win.listen('menu-close-tab', () => closeCurrentPane()));
    unlisteners.push(win.listen('menu-split-vertical', () => splitVertical()));
    unlisteners.push(win.listen('menu-split-horizontal', () => splitHorizontal()));
    unlisteners.push(win.listen('menu-settings', () => openSettings()));

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()));
    };
  }, [createNewTab, closeCurrentPane, splitVertical, splitHorizontal, openSettings]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // DEBUG: log all Cmd+key events
      if (e.metaKey) {
        console.log('Cmd+key pressed:', e.key, 'metaKey:', e.metaKey);
      }
      
      const action = matchKeyBinding(e);
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      console.log('Keybinding action:', action); // DEBUG
      switch (action) {
        case 'newTab':
          createNewTab();
          break;
        case 'newWindow':
          newWindow().catch((err) => {
            console.error('Failed to create new window:', err);
          });
          break;
        case 'closeTerminal':
          closeCurrentPane();
          break;
        case 'quitApp':
          requestExit();
          break;
        case 'prevTab':
          navigateTabs('prev');
          break;
        case 'nextTab':
          navigateTabs('next');
          break;
        case 'openSettings':
          toggleSettings();
          break;
        case 'openCommandPalette':
          toggleCommandPalette();
          break;
        case 'clearTerminal':
          clearTerminal();
          break;
        case 'openSearch':
          setShowSearch(true);
          break;
        case 'increaseFontSize':
          changeFontSize(1);
          break;
        case 'decreaseFontSize':
          changeFontSize(-1);
          break;
        case 'resetFontSize':
          resetFontSize();
          break;
        case 'splitVertical':
          splitVertical();
          break;
        case 'splitHorizontal':
          splitHorizontal();
          break;
        case 'askAIFix':
          document.dispatchEvent(new CustomEvent('request-ai-fix'));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [createNewTab, closeCurrentPane, navigateTabs, toggleSettings, toggleCommandPalette, clearTerminal, changeFontSize, resetFontSize, splitVertical, splitHorizontal, requestExit]);

  // Apply theme CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', theme.ui.bgPrimary);
    root.style.setProperty('--bg-secondary', theme.ui.bgSecondary);
    root.style.setProperty('--bg-tertiary', theme.ui.bgTertiary);
    root.style.setProperty('--text-primary', theme.ui.textPrimary);
    root.style.setProperty('--text-secondary', theme.ui.textSecondary);
    root.style.setProperty('--accent', theme.ui.accent);
    root.style.setProperty('--border', theme.ui.border);
  }, [theme]);

  // Apply opacity
  useEffect(() => {
    document.documentElement.style.setProperty('--bg-primary', 
      theme.ui.bgPrimary.replace(/[\d.]+\)$/, `${settings.opacity})`));
  }, [settings.opacity, theme]);

  return (
    <div className="app-container" style={{ 
      backdropFilter: settings.blur && !isMac ? `blur(${Math.max(0, settings.blurRadius)}px)` : 'none',
      WebkitBackdropFilter: settings.blur && !isMac ? `blur(${Math.max(0, settings.blurRadius)}px)` : 'none',
    }}>
      <TitleBar onNewTab={createNewTab} />
      
      <div className="terminal-container" style={{ position: 'relative' }}>
        {showSearch && (
          <SearchBar
            searchAddon={searchAddonRef.current}
            onClose={() => setShowSearch(false)}
          />
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{ display: tab.id === activeTabId ? 'block' : 'none', height: '100%' }}
          >
            {renderLayout(tab.id, tab.layout)}
          </div>
        ))}
        {tabs.length === 0 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-secondary)',
          }}>
            Press ⌘T to create a new terminal
          </div>
        )}
      </div>

      <StatusBar onOpenSearch={() => setShowSearch(true)} />

      {/* AI Quick Fix components */}
      <QuickFixButton />
      <QuickFixPopup />

      {isSettingsOpen && <Settings />}
      {isCommandPaletteOpen && (
        <CommandPalette
          onNewTab={createNewTab}
          onCloseTab={closeCurrentPane}
          onClearTerminal={clearTerminal}
          onOpenSearch={() => setShowSearch(true)}
          onScpDownload={handleScpDownload}
        />
      )}

      {isQuitConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={cancelQuit}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              minWidth: 320,
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Quit VelociTerm?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Do you really want to quit VelociTerm?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                onClick={cancelQuit}
              >
                Cancel
              </button>
              <button
                style={{
                  background: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  color: '#000',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                }}
                onClick={confirmQuit}
              >
                Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
