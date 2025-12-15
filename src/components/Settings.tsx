import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { themes } from '../themes';
import { saveConfig } from '../utils/tauri';

type SettingsCategory = 'appearance' | 'terminal' | 'keybindings';

type FontPresetId =
   | 'system'
   | 'sf_mono'
   | 'menlo'
   | 'monaco'
   | 'meslo'
   | 'custom';

const FONT_PRESETS: Array<{ id: FontPresetId; label: string; value: string }> = [
   {
     id: 'system',
     label: 'System Monospace',
     value:
       'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
   },
   { id: 'sf_mono', label: 'SF Mono', value: 'SFMono-Regular, ui-monospace, monospace' },
   { id: 'menlo', label: 'Menlo', value: 'Menlo, ui-monospace, monospace' },
   { id: 'monaco', label: 'Monaco', value: 'Monaco, ui-monospace, monospace' },
   { id: 'meslo', label: 'MesloLGS NF', value: 'MesloLGS NF, Menlo, Monaco, monospace' },
   { id: 'custom', label: 'Custom…', value: '' },
 ];

 function buildFontFamily(base: string, fallback: string) {
   const baseTrimmed = base.trim();
   const fallbackTrimmed = fallback.trim();
   if (!baseTrimmed && !fallbackTrimmed) return '';
   if (!baseTrimmed) return fallbackTrimmed;
   if (!fallbackTrimmed) return baseTrimmed;
   return `${baseTrimmed}, ${fallbackTrimmed}`;
 }

 function parseFontFamily(current: string) {
   const value = current.trim();

   for (const preset of FONT_PRESETS) {
     if (preset.id === 'custom') continue;
     if (value === preset.value) {
       return { presetId: preset.id as FontPresetId, customBase: '', fallback: '' };
     }
     if (value.startsWith(`${preset.value},`)) {
       return {
         presetId: preset.id as FontPresetId,
         customBase: '',
         fallback: value.slice(preset.value.length + 1).trim(),
       };
     }
   }

   return { presetId: 'custom' as FontPresetId, customBase: value, fallback: '' };
 }

export function Settings() {
  const { settings, setSettings, closeSettings } = useSettingsStore();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance');

  const initialFont = parseFontFamily(settings.fontFamily);
  const [fontPresetId, setFontPresetId] = useState<FontPresetId>(initialFont.presetId);
  const [customFontFamily, setCustomFontFamily] = useState<string>(initialFont.customBase);
  const [fontFallback, setFontFallback] = useState<string>(initialFont.fallback);

  const themeValue = themes[settings.theme] ? settings.theme : 'dark';
  const opacityPercent = Math.round(Math.min(1, Math.max(0.5, settings.opacity)) * 100);
  const fontSize = Math.min(24, Math.max(10, settings.fontSize));
  const blurRadius = Math.min(30, Math.max(0, settings.blurRadius));

  const handleSave = async () => {
    try {
      await saveConfig({
        opacity: settings.opacity,
        blur: settings.blur,
        blur_radius: settings.blurRadius,
        font_size: settings.fontSize,
        font_family: settings.fontFamily,
        theme: settings.theme,
        scrollback: settings.scrollback,
        cursor_style: settings.cursorStyle,
        cursor_blink: settings.cursorBlink,
        predictive_input: settings.predictiveInput,
        bell_enabled: settings.bellEnabled,
        confirm_cmd_q: settings.confirmCmdQ,
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const handleClose = () => {
    handleSave();
    closeSettings();
  };

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-sidebar">
            <button
              className={`settings-nav-item ${activeCategory === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveCategory('appearance')}
            >
              Appearance
            </button>
            <button
              className={`settings-nav-item ${activeCategory === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveCategory('terminal')}
            >
              Terminal
            </button>
            <button
              className={`settings-nav-item ${activeCategory === 'keybindings' ? 'active' : ''}`}
              onClick={() => setActiveCategory('keybindings')}
            >
              Keybindings
            </button>
          </div>

          <div className="settings-content">
            {activeCategory === 'appearance' && (
              <>
                <div className="settings-section">
                  <h3>Theme</h3>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Color Theme</div>
                      <div className="settings-description">Affects UI colors and terminal theme</div>
                    </div>
                    <select
                      className="settings-select"
                      size={8}
                      value={themeValue}
                      onChange={(e) => setSettings({ theme: e.target.value })}
                    >
                      {Object.entries(themes).map(([key, theme]) => (
                        <option key={key} value={key}>
                          {theme.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Window</h3>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Opacity</div>
                      <div className="settings-description">Window transparency (50-100%)</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        className="settings-slider"
                        min="50"
                        max="100"
                        step="1"
                        value={opacityPercent}
                        onChange={(e) =>
                          setSettings({
                            opacity: Math.min(1, Math.max(0.5, parseInt(e.target.value) / 100)),
                          })
                        }
                      />
                      <span style={{ minWidth: 40 }}>{opacityPercent}%</span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Blur</div>
                      <div className="settings-description">Backdrop blur</div>
                    </div>
                    <button
                      className={`settings-toggle ${settings.blur ? 'active' : ''}`}
                      onClick={() => setSettings({ blur: !settings.blur })}
                    />
                  </div>

                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Blur Intensity</div>
                      <div className="settings-description">0-30px</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        className="settings-slider"
                        min="0"
                        max="30"
                        step="1"
                        value={blurRadius}
                        disabled={!settings.blur}
                        onChange={(e) =>
                          setSettings({
                            blurRadius: Math.min(30, Math.max(0, parseInt(e.target.value))),
                          })
                        }
                      />
                      <span style={{ minWidth: 40 }}>{blurRadius}px</span>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Font</h3>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Font Family</div>
                    </div>
                    <select
                      className="settings-select"
                      value={fontPresetId}
                      onChange={(e) => {
                        const id = e.target.value as FontPresetId;
                        setFontPresetId(id);

                        if (id === 'custom') {
                          const next = buildFontFamily(customFontFamily, fontFallback);
                          setSettings({
                            fontFamily: next || FONT_PRESETS.find((p) => p.id === 'system')!.value,
                          });
                          return;
                        }

                        const preset = FONT_PRESETS.find((p) => p.id === id);
                        if (!preset) return;
                        setSettings({ fontFamily: buildFontFamily(preset.value, fontFallback) });
                      }}
                    >
                      {FONT_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {fontPresetId === 'custom' && (
                    <div className="settings-row">
                      <div>
                        <div className="settings-label">Custom Font</div>
                      </div>
                      <input
                        type="text"
                        className="settings-input"
                        value={customFontFamily}
                        onChange={(e) => {
                          const nextCustom = e.target.value;
                          setCustomFontFamily(nextCustom);
                          const next = buildFontFamily(nextCustom, fontFallback);
                          setSettings({
                            fontFamily: next || FONT_PRESETS.find((p) => p.id === 'system')!.value,
                          });
                        }}
                        style={{ width: 200 }}
                      />
                    </div>
                  )}

                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Fallback</div>
                    </div>
                    <input
                      type="text"
                      className="settings-input"
                      value={fontFallback}
                      onChange={(e) => {
                        const nextFallback = e.target.value;
                        setFontFallback(nextFallback);
                        const base =
                          fontPresetId === 'custom'
                            ? customFontFamily
                            : FONT_PRESETS.find((p) => p.id === fontPresetId)?.value ||
                              FONT_PRESETS.find((p) => p.id === 'system')!.value;
                        const next = buildFontFamily(base, nextFallback);
                        setSettings({ fontFamily: next });
                      }}
                      style={{ width: 200 }}
                    />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Font Size</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        className="settings-slider"
                        min="10"
                        max="24"
                        step="1"
                        value={fontSize}
                        onChange={(e) =>
                          setSettings({ fontSize: Math.min(24, Math.max(10, parseInt(e.target.value))) })
                        }
                      />
                      <span style={{ minWidth: 30 }}>{fontSize}px</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeCategory === 'terminal' && (
              <>
                <div className="settings-section">
                  <h3>Cursor</h3>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Cursor Style</div>
                    </div>
                    <select
                      className="settings-select"
                      value={settings.cursorStyle}
                      onChange={(e) =>
                        setSettings({ cursorStyle: e.target.value as 'block' | 'underline' | 'bar' })
                      }
                    >
                      <option value="block">Block</option>
                      <option value="underline">Underline</option>
                      <option value="bar">Bar</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Cursor Blink</div>
                    </div>
                    <button
                      className={`settings-toggle ${settings.cursorBlink ? 'active' : ''}`}
                      onClick={() => setSettings({ cursorBlink: !settings.cursorBlink })}
                    />
                  </div>
                </div>

                <div className="settings-section">
                  <h3>Buffer</h3>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Scrollback Lines</div>
                      <div className="settings-description">Number of lines to keep in history</div>
                    </div>
                    <input
                      type="number"
                      className="settings-input"
                      min="1000"
                      max="100000"
                      step="1000"
                      value={settings.scrollback}
                      onChange={(e) => setSettings({ scrollback: parseInt(e.target.value) })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Predictive Input</div>
                      <div className="settings-description">Show typed characters locally while waiting for remote echo</div>
                    </div>
                    <button
                      className={`settings-toggle ${settings.predictiveInput ? 'active' : ''}`}
                      onClick={() => setSettings({ predictiveInput: !settings.predictiveInput })}
                    />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Confirm Cmd+Q</div>
                      <div className="settings-description">Ask before quitting the app</div>
                    </div>
                    <button
                      className={`settings-toggle ${settings.confirmCmdQ ? 'active' : ''}`}
                      onClick={() => setSettings({ confirmCmdQ: !settings.confirmCmdQ })}
                    />
                  </div>
                </div>
              </>
            )}

            {activeCategory === 'keybindings' && (
              <div className="settings-section">
                <h3>Keyboard Shortcuts</h3>
                <div className="settings-row">
                  <div className="settings-label">New Tab</div>
                  <span className="settings-description">⌘ T</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Close Terminal</div>
                  <span className="settings-description">⌘ W</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Previous Tab</div>
                  <span className="settings-description">⌘ ⇧ [</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Next Tab</div>
                  <span className="settings-description">⌘ ⇧ ]</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Settings</div>
                  <span className="settings-description">⌘ ,</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Command Palette</div>
                  <span className="settings-description">⌘ P</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Clear Terminal</div>
                  <span className="settings-description">⌘ K</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Search</div>
                  <span className="settings-description">⌘ F</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Increase Font Size</div>
                  <span className="settings-description">⌘ +</span>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Decrease Font Size</div>
                  <span className="settings-description">⌘ -</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
