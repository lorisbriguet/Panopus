import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Type,
  Columns2,
  BookOpen,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BrandLogo, BrandMark } from "../BrandLogo";
import { useAppStore } from "../../stores/app-store";
import { useTabStore } from "../../stores/tab-store";
import { confirmIfDirty } from "../../lib/dirty-guard";
import { useT } from "../../i18n/useT";
import type { UIKey } from "../../i18n/ui";

type NavItem = { to: string; icon: typeof Type; labelKey: UIKey };
type SidebarItem = NavItem | { divider: true };

const navItems: SidebarItem[] = [
  { to: "/library", icon: Type, labelKey: "library" },
  { to: "/compare", icon: Columns2, labelKey: "compare" },
  { to: "/designers", icon: BookOpen, labelKey: "designers" },
  { to: "/settings", icon: Settings, labelKey: "settings" },
];

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const openTab = useTabStore((s) => s.openTab);
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // Filter visible nav items (non-divider only for keyboard nav)
  const visibleLinks = useMemo(() => {
    return navItems.filter((item): item is NavItem => {
      if ("divider" in item) return false;
      return true;
    });
  }, []);

  // Track keyboard focus index (-1 = no keyboard focus)
  const [focusIdx, setFocusIdx] = useState(-1);
  const navRef = useRef<HTMLElement>(null);
  const keyNavRef = useRef(false); // true when navigation was triggered by keyboard

  // Reset focus index when navigating via click (not keyboard)
  useEffect(() => {
    if (keyNavRef.current) {
      keyNavRef.current = false;
      return;
    }
    setFocusIdx(-1);
  }, [location.pathname]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea, or contentEditable
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      // Skip if modifier keys are held (except shift for potential combos)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Skip arrow keys on pages with their own sub-sidebar navigation
      // (unless sidebar has focus from ArrowLeft return)
      if (focusIdx === -1 && (location.pathname === "/settings" || location.pathname === "/profile")) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const len = visibleLinks.length;
        let next: number;
        if (focusIdx === -1) {
          const currentIdx = visibleLinks.findIndex(
            (item) => item.to === location.pathname || (item.to === "/" && location.pathname === "/")
          );
          if (e.key === "ArrowDown") {
            next = currentIdx >= 0 ? (currentIdx + 1) % len : 0;
          } else {
            next = currentIdx >= 0 ? (currentIdx - 1 + len) % len : len - 1;
          }
        } else {
          if (e.key === "ArrowDown") next = (focusIdx + 1) % len;
          else next = (focusIdx - 1 + len) % len;
        }
        // Auto-navigate immediately (like settings sub-sidebar) — but ask
        // first if the current page holds a dirty form
        const item = visibleLinks[next];
        if (item) {
          void confirmIfDirty(item.to).then((ok) => {
            if (!ok) return;
            setFocusIdx(next);
            keyNavRef.current = true;
            navigate(item.to);
          });
        }
      } else if (e.key === "ArrowRight" && focusIdx >= 0) {
        // If focused on settings/profile, enter the sub-sidebar
        const item = visibleLinks[focusIdx];
        if (item && (item.to === "/settings" || item.to === "/profile")) {
          e.preventDefault();
          void confirmIfDirty(item.to).then((ok) => {
            if (!ok) return;
            keyNavRef.current = true;
            navigate(item.to);
            setFocusIdx(-1); // Hand off to sub-sidebar
          });
        }
      } else if (e.key === "Escape" && focusIdx >= 0) {
        setFocusIdx(-1);
      }
    },
    [visibleLinks, focusIdx, navigate, location.pathname]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Listen for sidebar-focus event from sub-sidebars (ArrowLeft)
  useEffect(() => {
    const handler = () => {
      const currentIdx = visibleLinks.findIndex(
        (item) => item.to === location.pathname
      );
      if (currentIdx >= 0) setFocusIdx(currentIdx);
    };
    window.addEventListener("sidebar-focus", handler);
    return () => window.removeEventListener("sidebar-focus", handler);
  }, [visibleLinks, location.pathname]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusIdx < 0 || !navRef.current) return;
    const links = navRef.current.querySelectorAll("[data-nav-link]");
    links[focusIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  // All items (including dividers) for rendering
  const allVisible = useMemo(() => {
    return navItems;
  }, []);

  // Map from allVisible index to visibleLinks index (for focus matching)
  const linkIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    let counter = 0;
    allVisible.forEach((item, i) => {
      if (!("divider" in item)) map.set(i, counter++);
    });
    return map;
  }, [allVisible]);

  return (
    <aside
      className={`flex flex-col border-r border-sidebar-border bg-sidebar h-full transition-all ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className={`flex items-center h-14 border-b border-sidebar-border ${collapsed ? "justify-center px-2" : "px-5.5"}`}>
        {collapsed ? <BrandMark className="h-3.5" /> : <BrandLogo className="h-6" />}
      </div>
      <nav ref={navRef} className="flex-1 py-2 overflow-y-auto">
        {allVisible.map((item, i) => {
          if ("divider" in item) {
            return (
              <div key={`d-${i}`} className="my-2 mx-3 border-t border-[var(--color-border-divider)]" />
            );
          }
          const currentLinkIdx = linkIndexMap.get(i) ?? -1;
          const Icon = item.icon;
          const label = t[item.labelKey];
          const isFocused = focusIdx === currentLinkIdx;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-nav-link
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  openTab(item.to, t[item.labelKey]);
                }
              }}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3.5 py-1.5 mx-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-accent-light text-accent font-medium"
                    : "text-muted hover:bg-[var(--color-hover-row)] hover:text-[var(--color-text-secondary)]"
                }${isFocused ? " ring-2 ring-accent/40 ring-inset" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.5} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? t.expand_sidebar : t.collapse_sidebar}
          title={`${collapsed ? t.expand_sidebar : t.collapse_sidebar} (⌘B)`}
          className="flex items-center justify-center w-full py-1.5 rounded-md text-muted hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-row)] transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </aside>
  );
}
