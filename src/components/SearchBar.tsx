import { useState, useRef, useEffect } from 'react';
import { SearchAddon } from '@xterm/addon-search';

interface SearchBarProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

export function SearchBar({ searchAddon, onClose }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const decorations = {
    matchBackground: '#241400',
    matchBorder: '#FFD400',
    matchOverviewRuler: '#FFD400',
    activeMatchBackground: '#001B0C',
    activeMatchBorder: '#00FF5A',
    activeMatchColorOverviewRuler: '#00FF5A',
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = (next: boolean) => {
    if (!searchAddon || !query) return;
    if (next) {
      searchAddon.findNext(query, { decorations });
    } else {
      searchAddon.findPrevious(query, { decorations });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      handleSearch(!e.shiftKey);
    }
  };

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search..."
        value={query}
        onChange={(e) => {
          const q = e.target.value;
          setQuery(q);
          if (searchAddon && q) {
            searchAddon.findNext(q, { incremental: true, decorations });
          } else {
            searchAddon?.clearDecorations();
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => searchAddon?.clearActiveDecoration()}
      />
      <button className="search-button" onClick={() => handleSearch(false)}>
        ↑
      </button>
      <button className="search-button" onClick={() => handleSearch(true)}>
        ↓
      </button>
      <button
        className="search-close"
        onClick={() => {
          searchAddon?.clearDecorations();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
