import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  Type,
  Columns2,
  BookOpen,
  Settings,
  Search,
  Moon,
  Sun,
  Palette,
} from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { confirmIfDirty } from "../lib/dirty-guard";
import { useT } from "../i18n/useT";
import { THEMES } from "../lib/themes";

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const close = useAppStore((s) => s.closeCommandPalette);
  const toggle = useAppStore((s) => s.toggleCommandPalette);
  const setTheme = useAppStore((s) => s.setTheme);
  const themeId = useAppStore((s) => s.themeId);
  const navigate = useNavigate();
  const t = useT();
  const [search, setSearch] = useState("");

  // Cmd+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggle]);

  // Escape closes the palette
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  const go = async (path: string) => {
    close();
    setSearch("");
    if (await confirmIfDirty(path)) navigate(path);
  };

  const switchTheme = (id: string) => {
    setTheme(id);
    close();
    setSearch("");
  };

  if (!open) return null;

  const currentTheme = THEMES.find(t => t.id === themeId);
  const isDark = currentTheme?.mode === "dark";

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40" onClick={close} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <Command
          className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-header)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden"
          shouldFilter={true}
        >
          <div className="flex items-center gap-2 px-4 border-b border-[var(--color-border-divider)]">
            <Search size={16} className="text-muted shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={t.search_or_jump}
              className="w-full py-3 text-base outline-none bg-transparent border-none"
              autoFocus
            />
            <kbd className="text-[10px] text-muted bg-[var(--color-input-bg)] border border-[var(--color-border-divider)] px-1.5 py-0.5 rounded shrink-0">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted">
              {t.no_results}
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading={t.navigate} className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <PaletteItem icon={Type} label={t.library} onSelect={() => go("/library")} />
              <PaletteItem icon={Columns2} label={t.compare} onSelect={() => go("/compare")} />
              <PaletteItem icon={BookOpen} label={t.designers} onSelect={() => go("/designers")} />
              <PaletteItem icon={Settings} label={t.settings} onSelect={() => go("/settings")} />
            </Command.Group>

            {/* Appearance */}
            <Command.Group heading={t.appearance} className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <PaletteItem
                icon={isDark ? Sun : Moon}
                label={isDark ? t.switch_to_light : t.switch_to_dark}
                onSelect={() => switchTheme(isDark ? "default-light" : "default-dark")}
              />
              {THEMES.map((theme) => (
                <PaletteItem
                  key={theme.id}
                  icon={Palette}
                  label={`${t.theme}: ${theme.name}`}
                  onSelect={() => switchTheme(theme.id)}
                />
              ))}
            </Command.Group>
          </Command.List>

          <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-border-divider)] text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <kbd className="bg-[var(--color-input-bg)] border border-[var(--color-border-divider)] px-1 py-0.5 rounded text-[10px]">&uarr;&darr;</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-[var(--color-input-bg)] border border-[var(--color-border-divider)] px-1 py-0.5 rounded text-[10px]">&crarr;</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-[var(--color-input-bg)] border border-[var(--color-border-divider)] px-1 py-0.5 rounded text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

function PaletteItem({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-[var(--color-hover-row)] data-[selected=true]:bg-[var(--color-accent-light)] data-[selected=true]:text-accent"
    >
      <div className="w-7 h-7 rounded-md bg-[var(--color-input-bg)] flex items-center justify-center shrink-0">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <span className="flex-1">{label}</span>
    </Command.Item>
  );
}
