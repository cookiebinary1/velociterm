import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { themes } from '../themes';

interface Command {
  id: string;
  title: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  onNewTab: () => void;
  onCloseTab: () => void;
  onClearTerminal: () => void;
  onOpenSearch: () => void;
  onScpDownload: () => void;
}

export function CommandPalette({
  onNewTab,
  onCloseTab,
  onClearTerminal,
  onOpenSearch,
  onScpDownload,
}: CommandPaletteProps) {
  const { closeCommandPalette, toggleSettings, setSettings } = useSettingsStore();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: 'new-tab', title: 'New Tab', shortcut: '⌘T', action: () => { onNewTab(); closeCommandPalette(); } },
    { id: 'close-terminal', title: 'Close Terminal', shortcut: '⌘W', action: () => { onCloseTab(); closeCommandPalette(); } },
    { id: 'settings', title: 'Open Settings', shortcut: '⌘,', action: () => { toggleSettings(); closeCommandPalette(); } },
    { id: 'clear', title: 'Clear Terminal', shortcut: '⌘K', action: () => { onClearTerminal(); closeCommandPalette(); } },
    { id: 'search', title: 'Search in Terminal', shortcut: '⌘F', action: () => { onOpenSearch(); closeCommandPalette(); } },
    { id: 'scp-download', title: 'Download via SCP…', action: () => { onScpDownload(); closeCommandPalette(); } },
    ...Object.entries(themes).map(([key, theme]) => ({
      id: `theme-${key}`,
      title: `Theme: ${theme.name}`,
      action: () => { setSettings({ theme: key }); closeCommandPalette(); },
    })),
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCommandPalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  };

  return (
    <div className="command-palette-overlay" onClick={closeCommandPalette}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          placeholder="Type a command..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-results">
          {filteredCommands.map((cmd, index) => (
            <div
              key={cmd.id}
              className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={cmd.action}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="command-palette-item-title">{cmd.title}</span>
              {cmd.shortcut && (
                <span className="command-palette-item-shortcut">{cmd.shortcut}</span>
              )}
            </div>
          ))}
          {filteredCommands.length === 0 && (
            <div className="command-palette-item">
              <span className="command-palette-item-title" style={{ opacity: 0.5 }}>
                No commands found
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
