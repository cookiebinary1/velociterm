import { invoke } from '@tauri-apps/api/core';

export interface TerminalConfig {
  opacity: number;
  blur: boolean;
  blur_radius?: number;
  font_size: number;
  font_family: string;
  theme: string;
  scrollback: number;
  cursor_style: string;
  cursor_blink: boolean;
  predictive_input?: boolean;
  bell_enabled?: boolean;
  confirm_cmd_q: boolean;
}

export async function createPty(shell?: string, cwd?: string): Promise<string> {
  return invoke<string>('create_pty', { shell, cwd });
}

export async function writeToPty(ptyId: string, data: string): Promise<void> {
  return invoke('write_to_pty', { ptyId, data });
}

export async function resizePty(ptyId: string, cols: number, rows: number): Promise<void> {
  return invoke('resize_pty', { ptyId, cols, rows });
}

export async function killPty(ptyId: string): Promise<void> {
  return invoke('kill_pty', { ptyId });
}

export async function getShellPath(): Promise<string> {
  return invoke<string>('get_shell_path');
}

export async function loadConfig(): Promise<TerminalConfig> {
  return invoke<TerminalConfig>('load_config');
}

export async function saveConfig(config: TerminalConfig): Promise<void> {
  return invoke('save_config', { config });
}

export async function getHomeDir(): Promise<string> {
  return invoke<string>('get_home_dir');
}

export async function copyToDownloads(path: string): Promise<string> {
  return invoke<string>('copy_to_downloads', { path });
}

export async function scpDownload(remote: string): Promise<string> {
  return invoke<string>('scp_download', { remote });
}

export async function confirmClose(): Promise<void> {
  return invoke('confirm_close');
}

export async function confirmExit(): Promise<void> {
  return invoke('confirm_exit');
}

export async function newWindow(): Promise<void> {
  return invoke('new_window');
}
