import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { copyToDownloads, createPty, writeToPty, resizePty, getHomeDir } from '../utils/tauri';
import { useTerminalStore } from '../store/terminalStore';
import { useSettingsStore } from '../store/settingsStore';
import { getTheme } from '../themes';
import { usePredictiveInput } from '../hooks/usePredictiveInput';
import { useErrorStore } from '../store/errorStore';
import { detectError, extractErrorMessage, extractLastCommand } from '../utils/errorDetection';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  tabId: string;
  paneId: string;
  isActive: boolean;
  searchAddonRef?: React.MutableRefObject<SearchAddon | null>;
  fontSizeOffset?: number;
}

interface PtyOutput {
  pty_id: string;
  data: string;
}

const SCROLLBACK_CACHE_MAX = 200_000;
const scrollbackCache = new Map<string, string>();

// interface PtyEcho {
//   pty_id: string;
//   echo: boolean;
// }

export function Terminal({ tabId, paneId, isActive, searchAddonRef, fontSizeOffset = 0 }: TerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const searchAddonLocalRef = useRef<SearchAddon | null>(null);
  const fileLinksDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const homeDirRef = useRef<string | null>(null);
  // const echoStateRef = useRef<boolean | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenExitRef = useRef<UnlistenFn | null>(null);
  // const unlistenEchoRef = useRef<UnlistenFn | null>(null);
  const initializingRef = useRef(false);
  const outputBufferRef = useRef<string>('');
  const lastCommandRef = useRef<string>('');

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const { predictInput, reconcileOutput, setEnabled: setPredictiveEnabled } = usePredictiveInput(xtermRef);
  const { setError, clearError } = useErrorStore();

  const { settings } = useSettingsStore();
  const theme = getTheme(settings.theme);

  useEffect(() => {
    if (!contextMenu) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('.terminal-context-menu')) return;
      setContextMenu(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const initTerminal = useCallback(async () => {
    if (!termRef.current) return;
    if (xtermRef.current) return;
    if (initializingRef.current) return;
    initializingRef.current = true;

    const currentSettings = useSettingsStore.getState().settings;
    const currentTheme = getTheme(currentSettings.theme);

    const xterm = new XTerm({
      fontSize: currentSettings.fontSize,
      fontFamily: currentSettings.fontFamily,
      cursorStyle: currentSettings.cursorStyle,
      cursorBlink: currentSettings.cursorBlink,
      scrollback: currentSettings.scrollback,
      allowTransparency: true,
      theme: currentTheme.terminal,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      if (!/^https?:\/\//i.test(uri)) return;
      event.preventDefault();
      event.stopPropagation();
      openUrl(uri).catch((err: unknown) => {
        console.error('Failed to open URL:', uri, err);
      });
    });
    const searchAddon = new SearchAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(searchAddon);

    if (!homeDirRef.current) {
      getHomeDir()
        .then((home) => {
          homeDirRef.current = home;
        })
        .catch(() => {
          homeDirRef.current = null;
        });
    }

    if (!fileLinksDisposableRef.current) {
      const resolvePath = (token: string) => {
        const st = useTerminalStore.getState();
        const tab = st.tabs.find((t) => t.id === tabId);
        const pane = tab?.panes.find((p) => p.id === paneId);
        let cwd = pane?.cwd || '';
        if (cwd === '~' || cwd.startsWith('~/')) {
          const home = homeDirRef.current;
          if (home) {
            cwd = home + (cwd === '~' ? '' : cwd.slice(1));
          }
        }

        let t = token;
        if (t.startsWith('~/')) {
          const home = homeDirRef.current;
          if (home) t = home + t.slice(1);
        }
        if (t.startsWith('/')) return t;
        if (t.startsWith('./')) return (cwd ? cwd.replace(/\/+$/g, '') : '') + '/' + t.slice(2);
        if (t.startsWith('../')) return (cwd ? cwd.replace(/\/+$/g, '') : '') + '/' + t;
        return (cwd ? cwd.replace(/\/+$/g, '') : '') + '/' + t;
      };

      const stripToken = (raw: string) => {
        return raw.replace(/^[\s\(\[\{"'`]+/, '').replace(/[\s\)\]\}\.,;:!\?"'`]+$/, '');
      };

      const isCandidate = (raw: string) => {
        if (!raw) return false;
        if (/^https?:\/\//i.test(raw)) return false;
        const t = stripToken(raw);
        if (!t) return false;
        if (t.includes('://')) return false;
        if (t.includes('\\')) return false;
        if (t.includes(' ')) return false;
        if (t.length < 3) return false;
        if (!/^[~\./A-Za-z0-9_-]/.test(t)) return false;
        if (!/[\./]/.test(t)) return false;
        if (!/^[~\./A-Za-z0-9_-]+(\/[A-Za-z0-9._-]+)*$/.test(t)) return false;
        return true;
      };

      fileLinksDisposableRef.current = xterm.registerLinkProvider({
        provideLinks: (bufferLineNumber, callback) => {
          const line = xterm.buffer.active.getLine(bufferLineNumber);
          if (!line) return callback(undefined);
          const text = String(line.translateToString(true));
          if (!text) return callback(undefined);

          const links = [] as Array<{
            text: string;
            range: { start: { x: number; y: number }; end: { x: number; y: number } };
            activate: (event: MouseEvent, text: string) => void;
          }>;

          const re = /[^\s]+/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text))) {
            const raw = m[0] ?? '';
            if (!isCandidate(raw)) continue;
            const token = stripToken(raw);
            if (!token) continue;
            const startIndex = m.index + (raw.indexOf(token));
            const endIndex = startIndex + token.length;
            if (startIndex < 0 || endIndex <= startIndex) continue;

            links.push({
              text: token,
              range: {
                start: { x: startIndex + 1, y: bufferLineNumber + 1 },
                end: { x: endIndex + 1, y: bufferLineNumber + 1 },
              },
              activate: (event, tokenText) => {
                if (!event.metaKey) return;
                const abs = resolvePath(tokenText);
                if (!abs) return;
                event.preventDefault();
                event.stopPropagation();

                // Cmd+Shift+Click = open file directly
                if (event.shiftKey) {
                  openPath(abs).catch((err: unknown) => {
                    console.error('Failed to open path:', abs, err);
                  });
                  return;
                }

                // Cmd+Click = choose: OK -> download to ~/Downloads, Cancel -> reveal in Finder
                const download = window.confirm(`Download file to Downloads?\n\n${abs}\n\nCancel = Reveal in Finder`);
                if (!download) {
                  revealItemInDir(abs).catch((err: unknown) => {
                    console.error('Failed to reveal path:', abs, err);
                  });
                  return;
                }

                copyToDownloads(abs)
                  .then((dest) => revealItemInDir(dest))
                  .catch((err: unknown) => {
                    console.error('Failed to copy file to Downloads:', abs, err);
                  });
              },
            });
          }

          callback(links.length ? (links as any) : undefined);
        },
      });
    }

    searchAddonLocalRef.current = searchAddon;

    if (searchAddonRef && isActive) {
      searchAddonRef.current = searchAddon;
    }

    xterm.open(termRef.current);
    fitAddon.fit();

    const cached = scrollbackCache.get(paneId);
    if (cached) {
      const lastBreak = Math.max(cached.lastIndexOf('\n'), cached.lastIndexOf('\r'));
      const replay = lastBreak >= 0 ? cached.slice(0, lastBreak + 1) : '';
      if (replay) {
        xterm.write(replay);
      }
    }

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Try WebGL addon for GPU acceleration (after fit)
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      xterm.loadAddon(webglAddon);
    } catch {
      console.log('WebGL not supported, falling back to canvas');
    }

    try {
      const currentTab = useTerminalStore.getState().tabs.find((t) => t.id === tabId);
      const currentPane = currentTab?.panes.find((p) => p.id === paneId);

      useTerminalStore.getState().setPanePtyStatus(tabId, paneId, 'connecting');
      
      if (!currentPane?.ptyId) {
        const ptyId = await createPty(undefined, currentPane?.cwd);
        ptyIdRef.current = ptyId;
        useTerminalStore.getState().setPanePtyId(tabId, paneId, ptyId);
      } else {
        ptyIdRef.current = currentPane.ptyId;
      }
      
      const ptyId = ptyIdRef.current;
      if (ptyId) {
        useTerminalStore.getState().setPanePtyStatus(tabId, paneId, 'ok');
        unlistenOutputRef.current = await listen<PtyOutput>('pty-output', (event) => {
          if (event.payload.pty_id === ptyId) {
            useTerminalStore.getState().markPaneOutput(tabId, paneId);
            const prev = scrollbackCache.get(paneId) ?? '';
            const combined = prev + event.payload.data;
            scrollbackCache.set(
              paneId,
              combined.length > SCROLLBACK_CACHE_MAX
                ? combined.slice(combined.length - SCROLLBACK_CACHE_MAX)
                : combined
            );
            
            // Error detection logic
            const serverData = event.payload.data;
            outputBufferRef.current += serverData;
            
            // Keep only last 5000 chars for error detection
            if (outputBufferRef.current.length > 5000) {
              outputBufferRef.current = outputBufferRef.current.slice(-5000);
            }
            
            // Detect errors in output
            if (detectError(serverData)) {
              const errorMessage = extractErrorMessage(outputBufferRef.current);
              const command = lastCommandRef.current || extractLastCommand(outputBufferRef.current);
              
              if (command && errorMessage) {
                setError({
                  command,
                  output: errorMessage,
                  timestamp: Date.now(),
                });
              }
            }
            
            reconcileOutput(event.payload.data);
          }
        });

        unlistenExitRef.current = await listen<string>('pty-exit', (event) => {
          if (event.payload === ptyId) {
            useTerminalStore.getState().setPanePtyStatus(tabId, paneId, 'disconnected');
            useTerminalStore.getState().removePane(tabId, paneId);
          }
        });
      }

      setPredictiveEnabled(useSettingsStore.getState().settings.predictiveInput);

      // TODO: pty-echo detection from master FD is unreliable, disable for now
      // unlistenEchoRef.current = await listen<PtyEcho>('pty-echo', (event) => {
      //   if (event.payload.pty_id === ptyId) {
      //     echoStateRef.current = event.payload.echo;
      //     const enabled = useSettingsStore.getState().settings.predictiveInput && event.payload.echo;
      //     setPredictiveEnabled(enabled);
      //   }
      // });

      // Let Cmd+key shortcuts pass through to global handler
      xterm.attachCustomKeyEventHandler((e) => {
        // Allow native paste/copy inside xterm.
        if (e.metaKey && e.type === 'keydown' && e.key.toLowerCase() === 'v') {
          return true;
        }

        if (e.metaKey && e.type === 'keydown' && e.key.toLowerCase() === 'c') {
          return true;
        }

        if (e.metaKey && e.type === 'keydown') {
          return false; // Don't handle in xterm, let it bubble
        }
        return true;
      });

      // Send input to PTY with predictive echo
      xterm.onData((data) => {
        if (ptyIdRef.current) {
          useTerminalStore.getState().markPaneInput(tabId, paneId);
          predictInput(data);
          writeToPty(ptyIdRef.current, data);
          
          // Track command submissions and clear errors on new command
          if (data === '\r' || data === '\n') {
            // Command submitted - capture it
            const buffer = xterm.buffer.active;
            const cursorY = buffer.cursorY + buffer.baseY;
            
            // Try to get the current line text
            const line = buffer.getLine(cursorY);
            if (line) {
              const lineText = line.translateToString(true).trim();
              // Extract command after prompt (simple heuristic)
              const cmdMatch = lineText.match(/[$%>#]\s+(.+)$/);
              if (cmdMatch && cmdMatch[1]) {
                lastCommandRef.current = cmdMatch[1].trim();
              }
            }
            
            // Clear error state on new command
            clearError();
            outputBufferRef.current = '';
          }
        }
      });

      xterm.onBell(() => {
        const { settings } = useSettingsStore.getState();
        if (!settings.bellEnabled) return;

        const st = useTerminalStore.getState();
        const activeTab = st.tabs.find((t) => t.id === st.activeTabId);
        const isPaneActive = !!activeTab && activeTab.id === tabId && activeTab.activePaneId === paneId;
        if (isPaneActive) return;

        st.setPaneBellUnread(tabId, paneId, true);
      });

      // Handle resize
      xterm.onResize(({ cols, rows }) => {
        if (ptyIdRef.current) {
          resizePty(ptyIdRef.current, cols, rows);
        }
      });

      // Initial resize
      if (ptyIdRef.current) {
        await resizePty(ptyIdRef.current, xterm.cols, xterm.rows);
      }

      // Update title based on terminal content
      xterm.onTitleChange((title) => {
        useTerminalStore.getState().updateTab(tabId, { title: title || 'Terminal' });
      });
    } catch (error) {
      console.error('Failed to create PTY:', error);
      useTerminalStore.getState().setPanePtyStatus(tabId, paneId, 'disconnected');
      const msg = error instanceof Error ? error.message : String(error);
      xterm.write(`\r\n\x1b[31mFailed to create terminal session\x1b[0m\r\n${msg}\r\n`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, paneId, isActive, searchAddonRef]);

  useEffect(() => {
    initTerminal();

    return () => {
      if (unlistenOutputRef.current) {
        unlistenOutputRef.current();
        unlistenOutputRef.current = null;
      }
      if (unlistenExitRef.current) {
        unlistenExitRef.current();
        unlistenExitRef.current = null;
      }
      // if (unlistenEchoRef.current) {
      //   unlistenEchoRef.current();
      //   unlistenEchoRef.current = null;
      // }
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      if (fileLinksDisposableRef.current) {
        fileLinksDisposableRef.current.dispose();
        fileLinksDisposableRef.current = null;
      }
      initializingRef.current = false;
      ptyIdRef.current = null;
      // echoStateRef.current = null;

      const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId);
      const paneStillExists = !!tab?.panes.find((p) => p.id === paneId);
      if (!paneStillExists) {
        scrollbackCache.delete(paneId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, paneId]);

  // Handle resize on visibility or window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (termRef.current) {
      resizeObserver.observe(termRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [isActive]);

  // Focus terminal when active
  useEffect(() => {
    if (isActive && xtermRef.current) {
      xtermRef.current.focus();

      if (searchAddonRef && searchAddonLocalRef.current) {
        searchAddonRef.current = searchAddonLocalRef.current;
      }
    }
  }, [isActive, searchAddonRef]);

  // Update theme
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme.terminal;
    }
  }, [theme]);

  // Update font settings
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = settings.fontSize + fontSizeOffset;
      xtermRef.current.options.fontFamily = settings.fontFamily;
      xtermRef.current.options.cursorStyle = settings.cursorStyle;
      xtermRef.current.options.cursorBlink = settings.cursorBlink;
      fitAddonRef.current?.fit();
    }
  }, [settings.fontSize, settings.fontFamily, settings.cursorStyle, settings.cursorBlink, fontSizeOffset]);

  // Sync predictive input setting
  useEffect(() => {
    setPredictiveEnabled(settings.predictiveInput);
  }, [settings.predictiveInput, setPredictiveEnabled]);

  return (
    <div
      className="terminal-wrapper"
      style={{ position: 'relative' }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div ref={termRef} className="xterm" />
      {contextMenu && (
        <div
          className="terminal-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            type="button"
            onClick={async () => {
              setContextMenu(null);
              const sel = xtermRef.current?.getSelection() ?? '';
              if (!sel) return;
              try {
                await navigator.clipboard.writeText(sel);
              } catch (err) {
                console.error('Failed to copy selection:', err);
              }
            }}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={async () => {
              setContextMenu(null);
              if (!ptyIdRef.current) return;
              try {
                const text = await navigator.clipboard.readText();
                if (!text) return;
                await writeToPty(ptyIdRef.current, text);
              } catch (err) {
                console.error('Failed to paste:', err);
              }
            }}
          >
            Paste
          </button>
          <button
            type="button"
            onClick={async () => {
              setContextMenu(null);
              if (!ptyIdRef.current) return;
              try {
                await writeToPty(ptyIdRef.current, 'clear\n');
              } catch (err) {
                console.error('Failed to clear terminal:', err);
              }
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={async () => {
              setContextMenu(null);

              const st = useTerminalStore.getState();
              const tab = st.tabs.find((t) => t.id === tabId);
              const pane = tab?.panes.find((p) => p.id === paneId);
              let cwd = pane?.cwd || '';
              if (cwd === '~' || cwd.startsWith('~/')) {
                const home = homeDirRef.current;
                if (home) {
                  cwd = home + (cwd === '~' ? '' : cwd.slice(1));
                }
              }

              if (!cwd) return;
              try {
                await openPath(cwd);
              } catch (err) {
                console.error('Failed to open folder:', cwd, err);
              }
            }}
          >
            Reveal folder
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              useSettingsStore.getState().toggleCommandPalette();
            }}
          >
            Command Palette
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              useSettingsStore.getState().openSettings();
            }}
          >
            Settings
          </button>
        </div>
      )}
    </div>
  );
}
