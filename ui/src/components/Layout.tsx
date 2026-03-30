import { NavLink, Outlet } from 'react-router-dom';
import {
  Home,
  PlusCircle,
  Monitor,
  FolderOpen,
  Settings,
  Activity,
} from 'lucide-react';
import { useRuns } from '../hooks/useApi';
import styles from './Layout.module.css';

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/new-run', icon: PlusCircle, label: 'New Run' },
  { to: '/studio', icon: Monitor, label: 'Studio' },
  { to: '/library', icon: FolderOpen, label: 'Library' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Layout() {
  const { activeRunId, activeRunPaused } = useRuns();

  return (
    <div className={styles.shell}>
      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className={styles.topBar}>
        <span className={styles.topBarTitle}>Auto Video Studio</span>
        <div className={styles.topBarRight}>
          {activeRunId && (
            <div className={styles.runIndicator}>
              <Activity size={14} />
              <span
                className={`status-dot ${activeRunPaused ? 'status-dot-warning' : 'status-dot-running'}`}
              />
              <span>{activeRunPaused ? 'Run paused' : 'Run active'}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Body: sidebar + content ─────────────────────────── */}
      <div className={styles.body}>
        <nav className={styles.sidebar}>
          <ul className={styles.sidebarNav}>
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    [styles.navItem, isActive ? styles.active : '']
                      .filter(Boolean)
                      .join(' ')
                  }
                >
                  <Icon />
                  <span className={styles.navLabel}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
