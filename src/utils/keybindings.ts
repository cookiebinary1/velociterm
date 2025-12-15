export interface KeyBinding {
  key: string;
  meta?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  action: string;
}

export const defaultKeyBindings: KeyBinding[] = [
  { key: 't', meta: true, action: 'newTab' },
  { key: 'n', meta: true, action: 'newWindow' },
  { key: 'w', meta: true, action: 'closeTerminal' },
  { key: 'q', meta: true, action: 'quitApp' },
  { key: '[', meta: true, shift: true, action: 'prevTab' },
  { key: ']', meta: true, shift: true, action: 'nextTab' },
  { key: ',', meta: true, action: 'openSettings' },
  { key: 'p', meta: true, action: 'openCommandPalette' },
  { key: 'k', meta: true, action: 'clearTerminal' },
  { key: 'f', meta: true, action: 'openSearch' },
  { key: 'd', meta: true, action: 'splitVertical' },
  { key: 'd', meta: true, shift: true, action: 'splitHorizontal' },
  { key: '=', meta: true, action: 'increaseFontSize' },
  { key: '-', meta: true, action: 'decreaseFontSize' },
  { key: '0', meta: true, action: 'resetFontSize' },
  { key: 'a', meta: true, shift: true, action: 'askAIFix' },
];

export function matchKeyBinding(
  e: KeyboardEvent,
  bindings: KeyBinding[] = defaultKeyBindings
): string | null {
  for (const binding of bindings) {
    const metaMatch = binding.meta ? e.metaKey : !e.metaKey;
    const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
    const ctrlMatch = binding.ctrl ? e.ctrlKey : !e.ctrlKey;
    const altMatch = binding.alt ? e.altKey : !e.altKey;

    if (
      e.key.toLowerCase() === binding.key.toLowerCase() &&
      metaMatch &&
      shiftMatch &&
      ctrlMatch &&
      altMatch
    ) {
      return binding.action;
    }
  }
  return null;
}
