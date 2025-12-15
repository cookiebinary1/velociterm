// Error detection utilities for terminal output

export interface CommandError {
  command: string;
  output: string;
  exitCode?: number;
  timestamp: number;
}

/**
 * Detect if terminal output contains an error
 */
export function detectError(output: string): boolean {
  const errorPatterns = [
    // Generic error keywords
    /error:/i,
    /fatal:/i,
    /failed/i,
    /cannot/i,
    /permission denied/i,
    /command not found/i,
    /no such file/i,
    /not found/i,
    
    // Docker specific
    /cannot connect to.*docker daemon/i,
    /docker.*not running/i,
    
    // Git specific
    /git.*error/i,
    /fatal: not a git repository/i,
    
    // npm/yarn
    /npm err!/i,
    /error: command failed/i,
    
    // PHP/Laravel
    /fatal error:/i,
    /parse error:/i,
    /syntax error:/i,
    
    // Python
    /traceback \(most recent call last\)/i,
    /exception:/i,
    
    // General
    /\[error\]/i,
    /✗/,
  ];
  
  return errorPatterns.some(pattern => pattern.test(output));
}

/**
 * Extract the actual error message from output
 */
export function extractErrorMessage(output: string): string {
  const lines = output.split('\n');
  
  // Find lines containing error keywords
  const errorLines = lines.filter(line => 
    /error|fatal|failed|exception|cannot|denied/i.test(line)
  );
  
  // Take first 5 error lines (not too much)
  return errorLines.slice(0, 5).join('\n').trim();
}

/**
 * Extract last command from terminal buffer
 */
export function extractLastCommand(buffer: string): string | null {
  // Remove ANSI codes first
  const cleanBuffer = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const lines = cleanBuffer.split('\n').filter(Boolean);
  
  // Look for common prompt patterns backwards
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Match common prompt patterns: $, %, >, #
    const match = line.match(/[$%>#]\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
}
