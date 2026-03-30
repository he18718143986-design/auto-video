import { useNavigate } from 'react-router-dom';
import { PlusCircle, Monitor, Settings } from 'lucide-react';
import { useRuns, useConfig } from '../hooks/useApi';
import type { RunSummary, RunStatus } from '../types/index';
import styles from './Home.module.css';

function statusPillClass(status: RunStatus): string {
  switch (status) {
    case 'running':
      return 'pill pill-status pill-running';
    case 'completed':
      return 'pill pill-status pill-success';
    case 'failed':
      return 'pill pill-status pill-error';
    case 'needs_human':
    case 'paused':
      return 'pill pill-status pill-warning';
    default:
      return 'pill pill-status';
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return '';
  }
}

function formatStage(stage: string | null): string {
  if (!stage) return '—';
  return stage.replace(/_/g, ' ');
}

export function Home() {
  const navigate = useNavigate();
  const { runs, activeRunId } = useRuns();
  const { data: config, loading: configLoading } = useConfig();

  const activeRun = activeRunId ? runs.find((r) => r.id === activeRunId) : null;
  const needsAttentionCount = runs.filter((r) => r.requiresHuman).length;
  const recentRuns = [...runs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1>Welcome back</h1>
        <p className="text-secondary">Quick overview of your workspace</p>
      </div>

      {/* Status cards */}
      <div className={styles.statusCards}>
        {/* Active Run */}
        <div className={`card ${styles.statusCard}`}>
          <span className={styles.statusCardLabel}>Active Run</span>
          {activeRun ? (
            <>
              <span className={styles.statusCardValue}>{activeRun.topic}</span>
              <div className="row gap-sm">
                <span className={statusPillClass(activeRun.status)}>{activeRun.status}</span>
                <span className={styles.statusCardMeta}>
                  {formatStage(activeRun.currentStage)}
                </span>
              </div>
            </>
          ) : (
            <>
              <span className={styles.statusCardValue}>No active run</span>
              <span className={styles.statusCardMeta}>Start a new run to get going</span>
            </>
          )}
        </div>

        {/* Needs Attention */}
        <div className={`card ${styles.statusCard}`}>
          <span className={styles.statusCardLabel}>Needs Attention</span>
          <span className={styles.statusCardValue}>{needsAttentionCount}</span>
          <span className={styles.statusCardMeta}>
            {needsAttentionCount === 0
              ? 'All clear — no runs need intervention'
              : `${needsAttentionCount} run${needsAttentionCount > 1 ? 's' : ''} awaiting human input`}
          </span>
        </div>

        {/* Environment */}
        <div className={`card ${styles.statusCard}`}>
          <span className={styles.statusCardLabel}>Environment</span>
          {configLoading ? (
            <span className={styles.statusCardMeta}>Loading…</span>
          ) : config ? (
            <>
              <span className={styles.statusCardValue}>
                {config.profiles.length} profile{config.profiles.length !== 1 ? 's' : ''}
              </span>
              <span className={styles.statusCardMeta}>
                Default: {config.profiles.find((p) => p.id === config.defaultProfileId)?.name ?? config.defaultProfileId}
              </span>
            </>
          ) : (
            <span className={styles.statusCardMeta}>Unable to load config</span>
          )}
        </div>
      </div>

      {/* Recent Runs */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Recent Runs</h2>
          {runs.length > 5 && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>
              View all
            </button>
          )}
        </div>

        {recentRuns.length === 0 ? (
          <div className={`card ${styles.empty}`}>
            No runs yet. Create your first run to get started.
          </div>
        ) : (
          <div className={styles.runsGrid}>
            {recentRuns.map((run: RunSummary) => (
              <div
                key={run.id}
                className={`card ${styles.runCard}`}
                onClick={() => navigate(`/studio/${run.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/studio/${run.id}`);
                  }
                }}
              >
                <div className={styles.runCardTopic} title={run.topic}>
                  {run.topic}
                </div>
                <div className={styles.runCardRow}>
                  <span className={statusPillClass(run.status)}>{run.status}</span>
                  <span className={styles.runCardStage}>{formatStage(run.currentStage)}</span>
                </div>
                <div className={styles.runCardTime}>{formatTime(run.updatedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Quick Actions</h2>
        </div>
        <div className={styles.quickActions}>
          <button className="btn btn-primary" onClick={() => navigate('/new-run')}>
            <PlusCircle size={14} />
            New Run
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/studio')}>
            <Monitor size={14} />
            Open Studio
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/settings')}>
            <Settings size={14} />
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
