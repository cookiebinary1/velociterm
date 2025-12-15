import { useMemo, useEffect, useState } from 'react';
import { useTerminalStore } from '../store/terminalStore';
import { useSettingsStore } from '../store/settingsStore';
import { themes } from '../themes';
import { getShellPath, getHomeDir } from '../utils/tauri';

interface StatusBarProps {
  onOpenSearch: () => void;
}

function shortenPath(input: string, homeDir: string | null) {
  const value = input || '~';
  if (!homeDir) return value;
  if (value === homeDir) return '~';
  if (value.startsWith(homeDir + '/')) return '~' + value.slice(homeDir.length);
  return value;
}

function formatLatency(ms?: number) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function StatusBar({ onOpenSearch }: StatusBarProps) {
  const { tabs, activeTabId, adjustPaneFontSize, resetPaneFontSize } = useTerminalStore();
  const { settings, setSettings } = useSettingsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePane = activeTab?.panes.find((p) => p.id === activeTab.activePaneId);

  const [shellLabel, setShellLabel] = useState<string>('');
  const [homeDir, setHomeDir] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getShellPath()
      .then((path) => {
        if (!mounted) return;
        const base = path.split('/').filter(Boolean).pop();
        setShellLabel(base || path);
      })
      .catch(() => {
        if (!mounted) return;
        setShellLabel('');
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getHomeDir()
      .then((home) => {
        if (!mounted) return;
        setHomeDir(home);
      })
      .catch(() => {
        if (!mounted) return;
        setHomeDir(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cwdLabel = useMemo(() => {
    return shortenPath(activePane?.cwd || '~', homeDir);
  }, [activePane?.cwd, homeDir]);

  const statusLabel = useMemo(() => {
    const st = activePane?.ptyStatus ?? 'ok';
    return st.toUpperCase();
  }, [activePane?.ptyStatus]);

  const latencyLabel = useMemo(() => {
    return formatLatency(activePane?.lastLatencyMs);
  }, [activePane?.lastLatencyMs]);

  const hasBellUnread = useMemo(() => {
    if (!activeTab) return false;
    return activeTab.panes.some((p) => p.bellUnread && p.id !== activeTab.activePaneId);
  }, [activeTab]);

  const fontSize = settings.fontSize + (activePane?.fontSizeOffset ?? 0);
  const hasActivePane = !!activeTabId && !!activeTab?.activePaneId;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item" title="Shell / profile (detected from $SHELL)">
          {shellLabel || 'shell'}
        </div>
        <div className="status-sep" />
        <div
          className="status-item status-cwd"
          title={`Current working directory (CWD): ${activePane?.cwd || '~'}`}
        >
          {cwdLabel || '~'}
        </div>
      </div>

      <div className="status-bar-center">
        <button
          className={`status-pill ${settings.predictiveInput ? 'active' : ''}`}
          onClick={() => setSettings({ predictiveInput: !settings.predictiveInput })}
          title="Predictive Input (PI): shows typed characters locally while waiting for remote echo — feels faster on slow/remote terminals"
        >
          PI {settings.predictiveInput ? 'ON' : 'OFF'}
        </button>

        <div className="status-pill" title="Input mode indicator: INS = Insert, OVR = Overwrite">
          {(activePane?.inputMode ?? 'insert') === 'insert' ? 'INS' : 'OVR'}
        </div>

        <div
          className={`status-pill status-pty ${activePane?.ptyStatus ?? ''}`}
          title="PTY connection status + measured input→output latency"
        >
          {statusLabel || 'OK'}{latencyLabel ? ` · ${latencyLabel}` : ''}
        </div>
      </div>

      <div className="status-bar-right">
        <select
          className="status-select"
          value={themes[settings.theme] ? settings.theme : 'dark'}
          onChange={(e) => setSettings({ theme: e.target.value })}
          title="Theme (affects UI colors + terminal colors)"
        >
          {Object.entries(themes).map(([key, theme]) => (
            <option key={key} value={key}>
              {theme.name}
            </option>
          ))}
        </select>

        <button
          className="status-btn"
          onClick={() => {
            if (!activeTabId || !activeTab?.activePaneId) return;
            adjustPaneFontSize(activeTabId, activeTab.activePaneId, -1);
          }}
          disabled={!hasActivePane}
          title="Decrease font size (active pane)"
        >
          A-
        </button>
        <div
          className="status-item"
          style={{ minWidth: 40, textAlign: 'center' }}
          title="Font size (base setting + per-pane zoom offset)"
        >
          {fontSize}px
        </div>
        <button
          className="status-btn"
          onClick={() => {
            if (!activeTabId || !activeTab?.activePaneId) return;
            adjustPaneFontSize(activeTabId, activeTab.activePaneId, 1);
          }}
          disabled={!hasActivePane}
          title="Increase font size (active pane)"
        >
          A+
        </button>
        <button
          className="status-btn"
          onClick={() => {
            if (!activeTabId || !activeTab?.activePaneId) return;
            resetPaneFontSize(activeTabId, activeTab.activePaneId);
          }}
          disabled={!hasActivePane}
          title="Reset font size zoom (active pane)"
        >
          Reset
        </button>

        <button className="status-btn" onClick={onOpenSearch} title="Search in terminal (Cmd+F)">
          Search
        </button>

        <button
          className={`status-pill ${settings.bellEnabled ? 'active' : ''}`}
          onClick={() => setSettings({ bellEnabled: !settings.bellEnabled })}
          title="Bell notifications: enable/disable bells; * means unread bell happened in a background pane"
        >
          Bell {settings.bellEnabled ? 'ON' : 'OFF'}{hasBellUnread ? ' *' : ''}
        </button>
      </div>
    </div>
  );
}
