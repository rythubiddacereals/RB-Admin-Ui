import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topnav } from './Topnav';

/**
 * Two-column admin shell with a collapsible sidebar.
 *
 *   ┌──────┬───────────────────────────────────────────────┐
 *   │ NAV  │  Topnav (has the ☰ toggle + user + logout)     │
 *   │ 264px├───────────────────────────────────────────────┤
 *   │ or   │                                                │
 *   │ 68px │  <Outlet /> — the matched route page            │
 *   │      │                                                │
 *   └──────┴───────────────────────────────────────────────┘
 *
 * `collapsed` lives here so both the sidebar (width) and the
 * topnav (toggle-button icon direction) can react to it. Persisted
 * to localStorage so an operator's preference survives a reload.
 */
const STORAGE_KEY = 'rb_admin_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(next: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // best-effort — SSR / privacy mode
  }
}

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      writeCollapsed(next);
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-secondary-50">
      <Sidebar collapsed={collapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topnav collapsed={collapsed} onToggle={toggle} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
