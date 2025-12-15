# VelociTerm

Modern, fast, and visually appealing terminal emulator built with Tauri, optimized for high-latency connections.

## Features

- **Predictive Input** - Local echo for instant keystroke feedback, even over high-latency SSH connections (100-500ms+)
- **Transparent Window** - Configurable opacity with backdrop blur
- **Multiple Tabs** - Create and manage multiple terminal sessions
- **Theme Support** - Dark, Nord, Dracula, Cyberpunk, Solarized, Light
- **Command Palette** - Quick access to commands (⌘P)
- **Search** - Search within terminal output (⌘F)
- **Customizable** - Font, cursor style, scrollback and more

## Predictive Input (Local Echo)

VelociTerm features intelligent predictive input that displays your keystrokes immediately, without waiting for server confirmation. This dramatically improves the typing experience on high-latency connections like remote SSH sessions.

**How it works:**
1. When you type, characters appear instantly (shown dimmed)
2. When server response arrives, it's compared with the prediction
3. If matched - prediction is confirmed and styled normally
4. If mismatched - prediction is cleared and actual output is shown

This feature can be toggled in Settings.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘T | New tab |
| ⌘W | Close tab |
| ⌘⇧[ | Previous tab |
| ⌘⇧] | Next tab |
| ⌘, | Settings |
| ⌘P | Command palette |
| ⌘K | Clear terminal |
| ⌘F | Search |
| ⌘+ | Increase font size |
| ⌘- | Decrease font size |
| ⌘0 | Reset font size |

## Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- pnpm

### Setup

```bash
pnpm install
```

### Run in Development

```bash
pnpm tauri dev
```

### Build for Production

```bash
pnpm tauri build
```

## Configuration

Settings are stored in `~/.config/velociterm/config.json`

```json
{
  "opacity": 0.85,
  "blur": true,
  "font_size": 14,
  "font_family": "JetBrains Mono, Menlo, Monaco, monospace",
  "theme": "dark",
  "scrollback": 10000,
  "cursor_style": "block",
  "cursor_blink": true,
  "predictive_input": true
}
```

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Rust (Tauri)
- **Terminal**: xterm.js with WebGL rendering
- **Build**: Vite
