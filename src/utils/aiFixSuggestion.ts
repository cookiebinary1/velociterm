// AI-powered fix suggestions for terminal errors

export interface FixSuggestion {
  explanation: string;
  command: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Get AI-powered fix suggestion for a failed command
 */
export async function getAIFix(
  command: string,
  errorOutput: string,
  context: {
    cwd: string;
    shell: string;
    os: string;
  }
): Promise<FixSuggestion> {
  void context;

  const fallback = getFallbackSuggestion(command, errorOutput);
  if (fallback) return fallback;

  return {
    explanation: 'Could not generate a fix suggestion. Please check the error message and try again.',
    command: '',
    confidence: 'low',
  };
}

/**
 * Fallback suggestions for common errors (when AI fails)
 */
function getFallbackSuggestion(command: string, errorOutput: string): FixSuggestion | null {
  const lower = errorOutput.toLowerCase();
  
  // Docker daemon not running
  if (lower.includes('docker') && lower.includes('daemon')) {
    return {
      explanation: 'Docker daemon is not running. You need to start Docker first.',
      command: 'open -a Docker',
      confidence: 'high',
    };
  }
  
  // Permission denied
  if (lower.includes('permission denied')) {
    return {
      explanation: 'Permission denied. Try running with sudo.',
      command: `sudo ${command}`,
      confidence: 'medium',
    };
  }
  
  // Command not found
  if (lower.includes('command not found')) {
    const cmdName = command.split(' ')[0];
    return {
      explanation: `Command '${cmdName}' is not installed. You may need to install it first.`,
      command: `brew install ${cmdName}`,
      confidence: 'medium',
    };
  }
  
  // Git not a repository
  if (lower.includes('not a git repository')) {
    return {
      explanation: 'This directory is not a git repository. Initialize it first.',
      command: 'git init',
      confidence: 'high',
    };
  }
  
  return null;
}
