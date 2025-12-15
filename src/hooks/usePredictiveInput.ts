import { useRef, useCallback } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';

interface PredictionState {
  pending: string;           // Characters waiting for server confirmation
  cursorOffset: number;      // How many chars ahead of confirmed position
  passwordMode: boolean;     // True when password input detected
  recentOutput: string;      // Buffer of recent output for pattern matching
}

const MAX_RECENT_OUTPUT = 1000;

const stripAnsi = (input: string) => {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code !== 27) {
      out += input[i];
      continue;
    }

    const next = input[i + 1];
    if (next === '[') {
      i += 2;
      for (; i < input.length; i++) {
        const c = input.charCodeAt(i);
        if (c >= 0x40 && c <= 0x7e) {
          break;
        }
      }
      continue;
    }

    if (next === ']') {
      i += 2;
      for (; i < input.length; i++) {
        const c = input.charCodeAt(i);
        if (c === 7) {
          break;
        }
        if (c === 27 && input[i + 1] === '\\') {
          i += 1;
          break;
        }
      }
      continue;
    }
  }
  return out;
};

// Patterns that indicate password input (case insensitive)
const PASSWORD_PATTERNS = [
  /password\s*:/i,
  /passphrase.*:/i,
  /passcode\s*:/i,
  /pin\s*:/i,
  /secret\s*:/i,
  /token\s*:/i,
  /verification code/i,
  /enter passphrase/i,
  /enter\s+passphrase\s+for\s+key/i,
  /sudo.*password/i,
  /ssh.*key/i,
  /private key/i,
];

export function usePredictiveInput(xtermRef: React.RefObject<XTerm | null>) {
  const stateRef = useRef<PredictionState>({ pending: '', cursorOffset: 0, passwordMode: false, recentOutput: '' });
  const enabledRef = useRef(true);

  // Style for predicted (unconfirmed) text - dimmed
  const PREDICTED_STYLE = '\x1b[2m';  // Dim
  const RESET_STYLE = '\x1b[0m';

  // Internal helper to clear prediction (doesn't need useCallback)
  const clearPredictionInternal = (xterm: XTerm, state: PredictionState) => {
    for (let i = 0; i < state.cursorOffset; i++) {
      xterm.write('\b \b');
    }
    state.pending = '';
    state.cursorOffset = 0;
  };

  const getLastLine = (input: string) => {
    const cleaned = stripAnsi(input).replace(/\r/g, '');
    const idx = cleaned.lastIndexOf('\n');
    return (idx === -1 ? cleaned : cleaned.slice(idx + 1)).trimEnd();
  };

  const isSensitiveContext = (input: string) => {
    const cleaned = stripAnsi(input).replace(/\r/g, '');
    const lower = cleaned.toLowerCase();

    const hasSplitPassphrase = lower.includes('pass') && lower.includes('phrase');
    const hasPassphrasePrefix = lower.includes('passphr') || lower.includes('passph');
    const hasEnterPassPrefix = lower.includes('enter pass');

    if (hasPassphrasePrefix || hasSplitPassphrase) return true;

    if (PASSWORD_PATTERNS.some((pattern) => pattern.test(cleaned))) return true;
    if (hasEnterPassPrefix) return true;
    if (hasPassphrasePrefix && (lower.includes('enter') || lower.includes('key') || lower.includes(".ssh") || lower.includes(':'))) return true;
    if (lower.includes('enter passphrase')) return true;
    if (lower.includes('passphrase for key')) return true;
    if (lower.includes("enter passphrase for key")) return true;
    if (hasSplitPassphrase && (lower.includes('enter') || lower.includes('key') || lower.includes(".ssh") || lower.includes(':'))) return true;
    if (lower.includes('sudo') && lower.includes('password')) return true;
    return false;
  };

  const isSensitiveChunk = (chunk: string) => {
    const cleaned = stripAnsi(chunk).replace(/\r/g, '');
    const lower = cleaned.toLowerCase();
    const hasSplitPassphrase = lower.includes('pass') && lower.includes('phrase');
    const hasPassphrasePrefix = lower.includes('passphr') || lower.includes('passph');
    const hasEnterPassPrefix = lower.includes('enter pass');
    if (hasPassphrasePrefix || hasSplitPassphrase) return true;
    if (hasEnterPassPrefix) return true;
    if (lower.includes('enter passphrase')) return true;
    if (lower.includes('passphrase for key')) return true;
    if (lower.includes("enter passphrase for key")) return true;
    if (lower.includes('password:')) return true;
    if (lower.includes('passphrase') && lower.includes(':')) return true;
    if (hasPassphrasePrefix && (lower.includes('enter') || lower.includes('key') || lower.includes(".ssh") || lower.includes(':'))) return true;
    if (hasSplitPassphrase && (lower.includes('enter') || lower.includes('key') || lower.includes(".ssh") || lower.includes(':'))) return true;
    if (lower.includes('sudo') && lower.includes('password')) return true;
    return false;
  };

  const isSensitivePromptLine = (line: string) => {
    const lower = line.toLowerCase();
    if (PASSWORD_PATTERNS.some((pattern) => pattern.test(line))) return true;

    if (lower.includes('enter passphrase')) return true;
    if (lower.includes('enter pass')) return true;

    if (lower.includes('passphrase') && lower.includes('key')) return true;
    if (lower.includes('passphrase') && lower.includes(".ssh")) return true;

    if (!lower.includes(':')) return false;
    if (lower.includes('passphrase')) return true;
    if (lower.includes('password')) return true;
    if (lower.includes('passcode')) return true;
    if (lower.includes('verification code')) return true;
    if (lower.includes('pin')) return true;
    return false;
  };

  const isSensitiveOnScreen = (xterm: XTerm) => {
    const anyTerm = xterm as any;
    const active = anyTerm?.buffer?.active;
    if (!active || typeof active.getLine !== 'function') return false;

    const relCursorY = typeof active.cursorY === 'number' ? active.cursorY : 0;
    const baseY = typeof active.baseY === 'number' ? active.baseY : 0;
    const cursorCandidates = [relCursorY, baseY + relCursorY];
    for (const cursorY of cursorCandidates) {
      const start = Math.max(0, cursorY - 12);
      for (let i = cursorY; i >= start; i--) {
        const line = active.getLine(i);
        if (!line || typeof line.translateToString !== 'function') continue;
        const text = String(line.translateToString(true));
        const lower = text.toLowerCase();
        const hasSplitPassphrase = lower.includes('pass') && lower.includes('phrase');
        const hasPassphrasePrefix = lower.includes('passphr') || lower.includes('passph');
        if (hasPassphrasePrefix || hasSplitPassphrase) return true;
        if (lower.includes('enter passphrase')) return true;
        if (lower.includes('enter pass')) return true;
        if (lower.includes('passphrase')) return true;
        if (hasPassphrasePrefix && (lower.includes('enter') || lower.includes('key') || lower.includes(".ssh") || lower.includes(':'))) return true;
        if (hasSplitPassphrase && (lower.includes('enter') || lower.includes('key') || lower.includes(".ssh") || lower.includes(':'))) return true;
        if (lower.includes('password')) return true;
        if (lower.includes('verification code')) return true;
        if (lower.includes('passcode')) return true;
        if (lower.includes('pin')) return true;
      }
    }

    return false;
  };

  const predictInput = useCallback((data: string) => {
    if (!enabledRef.current || !xtermRef.current) return;
    
    const state = stateRef.current;

    if (state.passwordMode) {
      if (data.includes('\r') || data.includes('\n')) {
        state.passwordMode = false;
        state.recentOutput = '';
      }
      return;
    }

    if (!state.passwordMode) {
      const lastLine = getLastLine(state.recentOutput);
      if (
        isSensitivePromptLine(lastLine) ||
        isSensitiveContext(state.recentOutput) ||
        isSensitiveOnScreen(xtermRef.current)
      ) {
        state.passwordMode = true;
        clearPredictionInternal(xtermRef.current, state);
        return;
      }
    }
    
    // Don't predict in password mode
    if (state.passwordMode) return;

    const xterm = xtermRef.current;

    // Only predict printable characters and simple control sequences
    for (const char of data) {
      const code = char.charCodeAt(0);
      
      if (code >= 32 && code < 127) {
        // Printable ASCII - show immediately with dim style
        state.pending += char;
        state.cursorOffset++;
        xterm.write(PREDICTED_STYLE + char + RESET_STYLE);
      } else if (code === 127 || code === 8) {
        // Backspace - remove last predicted char if any
        if (state.pending.length > 0) {
          state.pending = state.pending.slice(0, -1);
          state.cursorOffset--;
          // Move cursor back, write space, move back again
          xterm.write('\b \b');
        } else {
          // No prediction to remove, let server handle it
          return;
        }
      } else if (char === '\r' || char === '\n') {
        // Enter - clear prediction state, don't predict newlines
        state.pending = '';
        state.cursorOffset = 0;
        return;
      } else if (char === '\x1b') {
        // Escape sequence start - don't predict, clear state
        state.pending = '';
        state.cursorOffset = 0;
        return;
      } else {
        // Other control characters - don't predict
        return;
      }
    }
  }, [xtermRef]);

  const reconcileOutput = useCallback((serverData: string) => {
    if (!xtermRef.current) return;
    
    const xterm = xtermRef.current;
    const state = stateRef.current;

    if (!state.passwordMode && isSensitiveChunk(serverData)) {
      state.passwordMode = true;
      clearPredictionInternal(xterm, state);
    }
    
    // Accumulate recent output for pattern matching (keep last MAX_RECENT_OUTPUT chars)
    state.recentOutput += serverData;
    if (state.recentOutput.length > MAX_RECENT_OUTPUT) {
      state.recentOutput = state.recentOutput.slice(-MAX_RECENT_OUTPUT);
    }
    
    const lastLine = getLastLine(state.recentOutput);
    const isPasswordPrompt = isSensitivePromptLine(lastLine) || isSensitiveContext(state.recentOutput);
    const enteredPasswordModeThisChunk = isPasswordPrompt && !state.passwordMode;
    if (enteredPasswordModeThisChunk) {
      state.passwordMode = true;
      clearPredictionInternal(xterm, state);
    }

    if (!enabledRef.current || state.pending.length === 0) {
      // No pending predictions or disabled, write directly
      xterm.write(serverData);
      return;
    }

    // Check if server output matches our prediction
    let matchLen = 0;
    for (let i = 0; i < Math.min(state.pending.length, serverData.length); i++) {
      if (state.pending[i] === serverData[i]) {
        matchLen++;
      } else {
        break;
      }
    }

    if (matchLen > 0) {
      // Partial or full match - remove matched chars from pending
      // First, erase the predicted text we showed
      for (let i = 0; i < state.cursorOffset; i++) {
        xterm.write('\b \b');
      }
      
      // Remove matched portion from pending
      state.pending = state.pending.slice(matchLen);
      state.cursorOffset = state.pending.length;
      
      // Write the confirmed server output
      xterm.write(serverData);
      
      // Re-display remaining predictions (if any)
      if (state.pending.length > 0) {
        xterm.write(PREDICTED_STYLE + state.pending + RESET_STYLE);
      }
    } else {
      // No match - server sent something unexpected
      // Erase all predictions
      for (let i = 0; i < state.cursorOffset; i++) {
        xterm.write('\b \b');
      }
      
      // Clear prediction state
      state.pending = '';
      state.cursorOffset = 0;
      
      // Write actual server output
      xterm.write(serverData);
    }
  }, [xtermRef]);

  const clearPrediction = useCallback(() => {
    if (!xtermRef.current) return;
    
    const xterm = xtermRef.current;
    const state = stateRef.current;
    
    // Erase predicted text
    for (let i = 0; i < state.cursorOffset; i++) {
      xterm.write('\b \b');
    }
    
    state.pending = '';
    state.cursorOffset = 0;
  }, [xtermRef]);

  const setEnabled = useCallback((enabled: boolean) => {
    if (!enabled) {
      clearPrediction();
    }
    enabledRef.current = enabled;
  }, [clearPrediction]);

  const isEnabled = useCallback(() => enabledRef.current, []);

  return {
    predictInput,
    reconcileOutput,
    clearPrediction,
    setEnabled,
    isEnabled,
  };
}
