import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTerminalStore } from '../store/terminalStore';
import { killPty } from '../utils/tauri';

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onNewTab: () => void;
}

export function TitleBar({ onNewTab }: TitleBarProps) {
  const { tabs, activeTabId, setActiveTab, removeTab, removePane } = useTerminalStore();

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const isFullscreen = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!isFullscreen);
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
    }
  };

  const handleStartDragging = async () => {
    try {
      await appWindow.startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    }
  };

  const handleClosePane = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      const activePane = tab.panes.find((p) => p.id === tab.activePaneId);
      if (activePane && activePane.ptyId) {
        await killPty(activePane.ptyId);
      }
      
      // If there's only one pane, remove the entire tab
      if (tab.panes.length === 1) {
        removeTab(tabId);
      } else {
        // Remove only the current pane
        removePane(tabId, tab.activePaneId);
      }
    }
  };

  return (
    <div className="titlebar">
      <div className="titlebar-buttons">
        <button
          className="titlebar-button close"
          onClick={handleClose}
          aria-label="Close"
        />
        <button
          className="titlebar-button minimize"
          onClick={handleMinimize}
          aria-label="Minimize"
        />
        <button
          className="titlebar-button maximize"
          onClick={handleMaximize}
          aria-label="Maximize"
        />
      </div>
      <div className="titlebar-tabs" data-tauri-drag-region onMouseDown={handleStartDragging}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`titlebar-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="button"
            tabIndex={0}
          >
            <span className="titlebar-tab-title">{tab.title}</span>
            <span
              className="titlebar-tab-close"
              onClick={(e) => handleClosePane(e, tab.id)}
              role="button"
              tabIndex={0}
              aria-label="Close terminal"
            >
              ×
            </span>
          </div>
        ))}
        <button className="titlebar-new-tab" onClick={onNewTab} aria-label="New tab">
          +
        </button>
      </div>
      <div
        className="titlebar-spacer"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      />
      <div className="titlebar-brand">
        <span className="titlebar-app-name">VelociTerm</span>
        <img src="/logo.png" alt="VelociTerm" className="titlebar-logo" />
      </div>
    </div>
  );
}
