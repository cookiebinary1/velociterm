import { useTerminalStore } from '../store/terminalStore';
import { killPty } from '../utils/tauri';

interface TabBarProps {
  onNewTab: () => void;
}

export function TabBar({ onNewTab }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTerminalStore();

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      for (const pane of tab.panes) {
        if (pane.ptyId) {
          await killPty(pane.ptyId);
        }
      }
    }
    removeTab(tabId);
  };

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          role="button"
          tabIndex={0}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tab.title}
          </span>
          <span
            className="tab-close"
            onClick={(e) => handleCloseTab(e, tab.id)}
            role="button"
            tabIndex={0}
            aria-label="Close tab"
          >
            ×
          </span>
        </div>
      ))}
      <button className="new-tab-button" onClick={onNewTab} aria-label="New tab">
        +
      </button>
    </div>
  );
}
