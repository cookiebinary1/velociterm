use once_cell::sync::Lazy;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;
use nix::sys::termios::{self, LocalFlags};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

// PTY instance holder
struct PtyInstance {
    pair: PtyPair,
    writer: Box<dyn Write + Send>,
}

// Global PTY storage
static PTY_INSTANCES: Lazy<Mutex<HashMap<String, Arc<Mutex<PtyInstance>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static CLOSE_CONFIRMED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static EXIT_CONFIRMED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct PtyOutput {
    pty_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyEcho {
    pty_id: String,
    echo: bool,
}

fn default_confirm_cmd_q() -> bool {
    true
}

fn default_predictive_input() -> bool {
    true
}

fn default_bell_enabled() -> bool {
    true
}

fn default_blur_radius() -> u32 {
    10
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub opacity: f64,
    pub blur: bool,
    #[serde(default = "default_blur_radius")]
    pub blur_radius: u32,
    pub font_size: u32,
    pub font_family: String,
    pub theme: String,
    pub scrollback: u32,
    pub cursor_style: String,
    pub cursor_blink: bool,
    #[serde(default = "default_predictive_input")]
    pub predictive_input: bool,
    #[serde(default = "default_bell_enabled")]
    pub bell_enabled: bool,
    #[serde(default = "default_confirm_cmd_q")]
    pub confirm_cmd_q: bool,
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            opacity: 0.85,
            blur: true,
            blur_radius: 10,
            font_size: 14,
            font_family: "MesloLGS NF, Menlo, Monaco, monospace".to_string(),
            theme: "dark".to_string(),
            scrollback: 10000,
            cursor_style: "block".to_string(),
            cursor_blink: true,
            predictive_input: true,
            bell_enabled: true,
            confirm_cmd_q: true,
        }
    }
}

#[tauri::command]
fn get_shell_path() -> Result<String, String> {
    // Try to detect user's default shell
    if let Ok(shell) = std::env::var("SHELL") {
        return Ok(shell);
    }
    
    // Fallback options
    let shells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    for shell in shells {
        if std::path::Path::new(shell).exists() {
            return Ok(shell.to_string());
        }
    }
    
    Err("No shell found".to_string())
}

#[tauri::command]
fn create_pty(app: AppHandle, shell: Option<String>, cwd: Option<String>) -> Result<String, String> {
    let pty_system = native_pty_system();
    
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_path = shell.unwrap_or_else(|| get_shell_path().unwrap_or("/bin/zsh".to_string()));
    
    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.arg("-i");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("HOME", dirs::home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default());
    
    // Set working directory
    let working_dir = cwd.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or("/".to_string())
    });
    cmd.cwd(&working_dir);

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let master_fd = pair.master.as_raw_fd();
    let echo_fd = master_fd;

    let pty_id = Uuid::new_v4().to_string();
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let instance = Arc::new(Mutex::new(PtyInstance { pair, writer }));
    
    {
        let mut instances = PTY_INSTANCES.lock();
        instances.insert(pty_id.clone(), instance);
    }

    // Spawn thread to read PTY output
    let pty_id_clone = pty_id.clone();
    let app_for_output = app.clone();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_for_output.emit(
                        "pty-output",
                        PtyOutput {
                            pty_id: pty_id_clone.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        
        // Clean up when PTY closes
        let mut instances = PTY_INSTANCES.lock();
        instances.remove(&pty_id_clone);
        let _ = app_for_output.emit("pty-exit", pty_id_clone);
    });

    if let Some(fd) = echo_fd {
        let pty_id_clone = pty_id.clone();
        let app_for_echo = app.clone();
        thread::spawn(move || {
            let mut last_echo: Option<bool> = None;
            loop {
                match termios::tcgetattr(fd) {
                    Ok(tio) => {
                        let echo = tio.local_flags.contains(LocalFlags::ECHO);
                        if last_echo != Some(echo) {
                            let _ = app_for_echo.emit(
                                "pty-echo",
                                PtyEcho {
                                    pty_id: pty_id_clone.clone(),
                                    echo,
                                },
                            );
                            last_echo = Some(echo);
                        }
                    }
                    Err(_) => break,
                }

                thread::sleep(Duration::from_millis(20));
            }
        });
    }

    Ok(pty_id)
}

#[tauri::command]
fn write_to_pty(pty_id: String, data: String) -> Result<(), String> {
    let instances = PTY_INSTANCES.lock();
    
    if let Some(instance) = instances.get(&pty_id) {
        let mut pty = instance.lock();
        pty.writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        pty.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("PTY not found".to_string())
    }
}

#[tauri::command]
fn resize_pty(pty_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let instances = PTY_INSTANCES.lock();
    
    if let Some(instance) = instances.get(&pty_id) {
        let pty = instance.lock();
        pty.pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("PTY not found".to_string())
    }
}

#[tauri::command]
fn kill_pty(pty_id: String) -> Result<(), String> {
    let mut instances = PTY_INSTANCES.lock();
    instances.remove(&pty_id);
    Ok(())
}

#[tauri::command]
fn load_config() -> Result<TerminalConfig, String> {
    let config_path = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("velociterm")
        .join("config.json");

    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(TerminalConfig::default())
    }
}

#[tauri::command]
fn save_config(config: TerminalConfig) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("velociterm");

    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_path = config_dir.join("config.json");
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or("Could not find home directory".to_string())
}

#[tauri::command]
fn copy_to_downloads(path: String) -> Result<String, String> {
    let src = PathBuf::from(path);
    if !src.exists() {
        return Err("File not found".to_string());
    }
    if !src.is_file() {
        return Err("Not a file".to_string());
    }

    let downloads_dir = dirs::download_dir().ok_or("Could not find Downloads directory".to_string())?;
    let file_name = src.file_name().ok_or("Invalid file name".to_string())?;
    let mut dest = downloads_dir.join(file_name);

    if dest.exists() {
        let stem = src
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or("Invalid file name".to_string())?
            .to_string();
        let ext = src.extension().and_then(|e| e.to_str()).map(|s| s.to_string());

        let mut found = false;
        for i in 1..=999 {
            let candidate = if let Some(ref ext) = ext {
                format!("{} ({}).{}", stem, i, ext)
            } else {
                format!("{} ({})", stem, i)
            };
            let candidate_path = downloads_dir.join(candidate);
            if !candidate_path.exists() {
                dest = candidate_path;
                found = true;
                break;
            }
        }

        if !found {
            return Err("Could not find an available file name in Downloads".to_string());
        }
    }

    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

fn unique_downloads_dest(file_name: &str) -> Result<PathBuf, String> {
    let downloads_dir = dirs::download_dir().ok_or("Could not find Downloads directory".to_string())?;
    let mut dest = downloads_dir.join(file_name);

    if !dest.exists() {
        return Ok(dest);
    }

    let src = PathBuf::from(file_name);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid file name".to_string())?
        .to_string();
    let ext = src.extension().and_then(|e| e.to_str()).map(|s| s.to_string());

    for i in 1..=999 {
        let candidate = if let Some(ref ext) = ext {
            format!("{} ({}).{}", stem, i, ext)
        } else {
            format!("{} ({})", stem, i)
        };
        let candidate_path = downloads_dir.join(candidate);
        if !candidate_path.exists() {
            dest = candidate_path;
            return Ok(dest);
        }
    }

    Err("Could not find an available file name in Downloads".to_string())
}

#[tauri::command]
fn scp_download(remote: String) -> Result<String, String> {
    let remote = remote.trim().to_string();
    if remote.is_empty() {
        return Err("Missing remote spec".to_string());
    }
    if remote.contains(char::is_whitespace) {
        return Err("Remote spec must not contain whitespace".to_string());
    }
    if remote.starts_with('-') {
        return Err("Invalid remote spec".to_string());
    }
    if !remote.contains(':') {
        return Err("Remote spec must look like user@host:/path/to/file".to_string());
    }

    let path_part = remote
        .splitn(2, ':')
        .nth(1)
        .ok_or("Invalid remote spec".to_string())?;
    let path_buf = PathBuf::from(path_part);
    let file_name = path_buf
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Could not infer file name from remote path".to_string())?
        .to_string();

    let dest = unique_downloads_dest(&file_name)?;

    let out = Command::new("scp")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=10")
        .arg("-q")
        .arg(&remote)
        .arg(&dest)
        .output()
        .map_err(|e| format!("Failed to run scp: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        let msg = if !stderr.trim().is_empty() {
            stderr
        } else if !stdout.trim().is_empty() {
            stdout
        } else {
            format!("scp failed with status: {}", out.status)
        };
        return Err(msg);
    }

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn confirm_close(window: tauri::Window) -> Result<(), String> {
    CLOSE_CONFIRMED.store(true, std::sync::atomic::Ordering::SeqCst);
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn confirm_exit(app: AppHandle) -> Result<(), String> {
    EXIT_CONFIRMED.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

fn open_new_window(app: &AppHandle) -> Result<(), String> {
    let label = format!("window-{}", Uuid::new_v4());
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("VelociTerm")
        .inner_size(900.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .decorations(false)
        .transparent(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn new_window(app: AppHandle) -> Result<(), String> {
    open_new_window(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Use predefined Quit so Cmd+Q is handled by the OS reliably on macOS.
                let quit_item = PredefinedMenuItem::quit(app, None)?;

                let settings_item = MenuItemBuilder::with_id("settings", "Settings…")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;

                let app_menu = SubmenuBuilder::new(app, "VelociTerm")
                    .item(&settings_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                // Standard Edit submenu for clipboard actions.
                let cut_item = PredefinedMenuItem::cut(app, None)?;
                let copy_item = PredefinedMenuItem::copy(app, None)?;
                let paste_item = PredefinedMenuItem::paste(app, None)?;
                let select_all_item = PredefinedMenuItem::select_all(app, None)?;

                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .item(&cut_item)
                    .item(&copy_item)
                    .item(&paste_item)
                    .item(&select_all_item)
                    .build()?;

                // Window submenu
                let new_window_item = MenuItemBuilder::with_id("new_window", "New Window")
                    .accelerator("CmdOrCtrl+N")
                    .build(app)?;
                let new_tab_item = MenuItemBuilder::with_id("new_tab", "New Tab")
                    .accelerator("CmdOrCtrl+T")
                    .build(app)?;
                let close_tab_item = MenuItemBuilder::with_id("close_tab", "Close Terminal")
                    .accelerator("CmdOrCtrl+W")
                    .build(app)?;
                let split_vertical_item = MenuItemBuilder::with_id("split_vertical", "Split Vertical")
                    .accelerator("CmdOrCtrl+D")
                    .build(app)?;
                let split_horizontal_item = MenuItemBuilder::with_id("split_horizontal", "Split Horizontal")
                    .accelerator("CmdOrCtrl+Shift+D")
                    .build(app)?;
                let minimize_item = PredefinedMenuItem::minimize(app, None)?;
                let fullscreen_item = PredefinedMenuItem::fullscreen(app, None)?;

                let window_menu = SubmenuBuilder::new(app, "Window")
                    .item(&new_window_item)
                    .item(&new_tab_item)
                    .item(&close_tab_item)
                    .separator()
                    .item(&split_vertical_item)
                    .item(&split_horizontal_item)
                    .separator()
                    .item(&minimize_item)
                    .item(&fullscreen_item)
                    .build()?;

                // Help submenu
                let about_item = MenuItemBuilder::with_id("about", "About VelociTerm")
                    .build(app)?;
                let documentation_item = MenuItemBuilder::with_id("documentation", "Documentation")
                    .build(app)?;

                let help_menu = SubmenuBuilder::new(app, "Help")
                    .item(&about_item)
                    .item(&documentation_item)
                    .build()?;

                let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu, &window_menu, &help_menu]).build()?;
                app.set_menu(menu)?;
            }

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();

            if id == "new_window" {
                let _ = open_new_window(app);
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                match id {
                    "settings" => { let _ = window.emit("menu-settings", ()); }
                    "new_tab" => { let _ = window.emit("menu-new-tab", ()); }
                    "close_tab" => { let _ = window.emit("menu-close-tab", ()); }
                    "split_vertical" => { let _ = window.emit("menu-split-vertical", ()); }
                    "split_horizontal" => { let _ = window.emit("menu-split-horizontal", ()); }
                    "about" => { let _ = window.emit("menu-about", ()); }
                    "documentation" => {
                        let _ = tauri_plugin_opener::open_url("https://github.com/user/velociterm", None::<&str>);
                    }
                    _ => {}
                }
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Allow closing only if it was explicitly confirmed by frontend
                if CLOSE_CONFIRMED.swap(false, std::sync::atomic::Ordering::SeqCst) {
                    return;
                }

                let _ = window.emit("close-requested", ());
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_to_pty,
            resize_pty,
            kill_pty,
            get_shell_path,
            load_config,
            save_config,
            get_home_dir,
            copy_to_downloads,
            scp_download,
            confirm_close,
            confirm_exit,
            new_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            println!("RunEvent::ExitRequested");
            // Allow exiting only if it was explicitly confirmed by frontend
            if EXIT_CONFIRMED.swap(false, std::sync::atomic::Ordering::SeqCst) {
                println!("Exit allowed (EXIT_CONFIRMED=true)");
                return;
            }

            println!("Exit prevented (waiting for frontend confirm)");

            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("exit-requested", ());
            } else {
                let _ = app_handle.emit("exit-requested", ());
            }
            api.prevent_exit();
        }
    });
}
