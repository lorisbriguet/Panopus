import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Palette } from "lucide-react";
import { useAppStore, ACCENT_PRESETS, type AccentPreset } from "../stores/app-store";
import { THEMES } from "../lib/themes";
import { useT } from "../i18n/useT";
import type { AppLanguage } from "../i18n/ui";
import { Select, Button } from "../components/ui";
import { Toggle } from "../components/ui/Toggle";
import { logError } from "../lib/log";

type SettingsCategory = "appearance";

export function SettingsPage() {
  const accentColor = useAppStore((s) => s.accentColor);
  const setAccentColor = useAppStore((s) => s.setAccentColor);
  const themeId = useAppStore((s) => s.themeId);
  const setTheme = useAppStore((s) => s.setTheme);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const setReduceMotion = useAppStore((s) => s.setReduceMotion);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const [activeCategory] = useState<SettingsCategory>("appearance");
  const [appVersion, setAppVersion] = useState("");
  const t = useT();

  useEffect(() => {
    getVersion().then(setAppVersion).catch((e) => logError("Failed to read app version:", e));
  }, []);

  const renderAppearance = () => (
    <div className="space-y-6">
      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.app_language}
        </label>
        <Select
          value={language}
          onChange={(e) => setLanguage(e.target.value as AppLanguage)}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </Select>
      </div>

      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.theme}
        </label>
        <Select
          value={themeId}
          onChange={(e) => setTheme(e.target.value)}
        >
          {Object.entries(THEMES).map(([id, theme]) => (
            <option key={id} value={id}>
              {theme.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="block mb-1.5 text-sm font-medium text-fg-base">
          {t.accent_color}
        </label>
        <div className="grid grid-cols-6 gap-2">
          {ACCENT_PRESETS.map((preset: AccentPreset) => (
            <button
              key={preset.name}
              onClick={() => setAccentColor(preset)}
              className={`
                h-10 rounded-md border-2 transition-all
                ${accentColor.name === preset.name ? "border-accent ring-2 ring-accent/30" : "border-transparent hover:border-border"}
              `}
              style={{ backgroundColor: preset.color }}
              title={preset.name}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-fg-base">{t.reduce_motion}</div>
          <div className="text-xs text-fg-subtle mt-0.5">{t.reduce_motion_desc}</div>
        </div>
        <Toggle checked={reduceMotion} onChange={setReduceMotion} />
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <div className="text-xs text-fg-subtle">Version {appVersion}</div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-fg-base mb-6">{t.settings}</h1>

        <div className="flex gap-6">
          <div className="w-48 shrink-0">
            <nav className="space-y-1">
              <Button
                variant={activeCategory === "appearance" ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                <Palette className="mr-2 h-4 w-4" />
                {t.appearance}
              </Button>
            </nav>
          </div>

          <div className="flex-1">
            <div className="bg-bg-elevated rounded-lg p-6 border border-border">
              {activeCategory === "appearance" && renderAppearance()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
