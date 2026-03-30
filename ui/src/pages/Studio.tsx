import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRuns, useRun, useRunDetails, useConfig } from '../hooks/useApi';
import * as api from '../api/client';
import {
  STAGE_SEQUENCE,
  type HandoffChecklistItem,
  type RunDetails,
  type RunManifest,
  type RunStatus,
  type RunSummary,
  type StageName,
  type StageStatus,
} from '../types/index';
import { RunAssetsPanel } from '../components/RunAssetsPanel';
import styles from './Studio.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────

type TabId = 'overview' | 'live' | 'outputs' | 'timeline' | 'handoff';
type StatusFilter = 'all' | 'running' | 'needs_human' | 'completed' | 'failed';

function statusPillClass(status: RunStatus | StageStatus): string {
  switch (status) {
    case 'running':
    case 'started':
    case 'resumed':
      return 'pill pill-status pill-running';
    case 'completed':
      return 'pill pill-status pill-success';
    case 'failed':
      return 'pill pill-status pill-error';
    case 'needs_human':
    case 'paused':
      return 'pill pill-status pill-warning';
    case 'skipped':
      return 'pill pill-status';
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
    return `${Math.floor(diffHr / 24)}d ago`;
  } catch {
    return '';
  }
}

function formatStage(stage: string | null): string {
  if (!stage) return '—';
  return stage.replace(/_/g, ' ');
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function elapsed(from: string, to?: string): string {
  try {
    const start = new Date(from).getTime();
    const end = to ? new Date(to).getTime() : Date.now();
    const sec = Math.floor((end - start) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m`;
  } catch {
    return '—';
  }
}

function matchesFilter(run: RunSummary, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs_human') return run.requiresHuman;
  return run.status === filter;
}

// ── Subcomponents ────────────────────────────────────────────────────────

function StageProgressBar({ run }: { run: RunManifest }) {
  const currentIdx = run.currentStage ? STAGE_SEQUENCE.indexOf(run.currentStage) : -1;
  const completedStages = new Set(
    run.history.filter((h) => h.status === 'completed').map((h) => h.stage),
  );
  const failedStages = new Set(
    run.history.filter((h) => h.status === 'failed').map((h) => h.stage),
  );
  const humanStages = new Set(
    run.history.filter((h) => h.status === 'needs_human').map((h) => h.stage),
  );

  return (
    <div>
      <div className={styles.stageProgress}>
        {STAGE_SEQUENCE.map((stage, i) => {
          let dotClass = styles.stageDot;
          if (completedStages.has(stage)) dotClass += ` ${styles.stageDotCompleted}`;
          else if (failedStages.has(stage)) dotClass += ` ${styles.stageDotFailed}`;
          else if (humanStages.has(stage)) dotClass += ` ${styles.stageDotHuman}`;
          else if (i === currentIdx) dotClass += ` ${styles.stageDotCurrent}`;

          const connectorClass =
            i < STAGE_SEQUENCE.length - 1
              ? `${styles.stageConnector}${completedStages.has(stage) ? ` ${styles.stageConnectorDone}` : ''}`
              : undefined;

          return (
            <span key={stage} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className={dotClass} title={formatStage(stage)} />
              {connectorClass && <span className={connectorClass} />}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
        {STAGE_SEQUENCE.map((s) => formatStage(s)).join(' → ')}
      </div>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────

function OverviewTab({ run }: { run: RunManifest }) {
  const completedCount = new Set(
    run.history.filter((h) => h.status === 'completed').map((h) => h.stage),
  ).size;

  return (
    <div className="stack">
      <div className={styles.overviewGrid}>
        <div className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>Topic</span>
          <span className={styles.overviewCardValue}>{run.topic}</span>
        </div>
        <div className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>Provider</span>
          <span className={styles.overviewCardValue}>{run.provider}</span>
        </div>
        <div className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>Created</span>
          <span className={styles.overviewCardValue}>{formatDateTime(run.createdAt)}</span>
        </div>
        <div className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>Elapsed</span>
          <span className={styles.overviewCardValue}>
            {elapsed(run.createdAt, run.status === 'completed' ? run.updatedAt : undefined)}
          </span>
        </div>
      </div>

      <h3>Stage Progress</h3>
      <StageProgressBar run={run} />

      <div className={styles.overviewGrid}>
        <div className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>Stages Completed</span>
          <span className={styles.overviewCardValue}>
            {completedCount} / {STAGE_SEQUENCE.length}
          </span>
        </div>
        <div className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>Current Stage</span>
          <span className={styles.overviewCardValue}>{formatStage(run.currentStage)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Live Browser Tab ─────────────────────────────────────────────────────

function LiveTab({ previewUrl }: { previewUrl: string | null }) {
  if (!previewUrl) {
    return <div className={styles.previewPlaceholder}>No preview available</div>;
  }
  return (
    <div className={styles.previewContainer}>
      <img
        className={styles.previewImage}
        src={previewUrl}
        alt="Live browser preview"
        key={previewUrl}
      />
      <small className="text-muted">Auto-refreshes when a new screenshot is available</small>
    </div>
  );
}

// ── Outputs Tab ──────────────────────────────────────────────────────────

function OutputsTab({
  run,
  runId,
  details,
  detailsLoading,
}: {
  run: RunManifest;
  runId: string;
  details: RunDetails | null;
  detailsLoading: boolean;
}) {
  const generatedArtifacts = Object.values(run.artifacts).filter(Boolean).length;

  return (
    <div className="stack">
      <div className={styles.outputsHeader}>
        <div>
          <h3>Run Outputs</h3>
          <p className="text-secondary">
            Browse parsed text artifacts, screenshots, generated media, and the final video from this run.
          </p>
        </div>
        <div className={styles.outputsMeta}>
          <span className="pill">{generatedArtifacts} manifest artifacts</span>
          {details && <span className="pill">{details.mediaFiles.length} media files</span>}
          {details && <span className="pill">{details.screenshots.length} screenshots</span>}
        </div>
      </div>

      <RunAssetsPanel
        runId={runId}
        details={details}
        loading={detailsLoading}
        emptyMessage="No output files were collected for this run yet."
      />
    </div>
  );
}

// ── Timeline Tab ─────────────────────────────────────────────────────────

function TimelineTab({ run }: { run: RunManifest }) {
  const entries = [...run.history].reverse();

  if (entries.length === 0) {
    return <div className={styles.empty}>No history entries yet.</div>;
  }

  function entryBorderClass(status: StageStatus): string {
    switch (status) {
      case 'completed':
        return styles.timelineCompleted;
      case 'failed':
        return styles.timelineFailed;
      case 'needs_human':
        return styles.timelineHuman;
      case 'started':
      case 'resumed':
        return styles.timelineRunning;
      default:
        return '';
    }
  }

  return (
    <div className={styles.timelineList}>
      {entries.map((entry, i) => (
        <div key={i} className={`${styles.timelineEntry} ${entryBorderClass(entry.status)}`}>
          <div className={styles.timelineHeader}>
            <div className="row gap-sm">
              <span className={styles.timelineStage}>{formatStage(entry.stage)}</span>
              <span className={statusPillClass(entry.status)}>{entry.status}</span>
            </div>
            <span className={styles.timelineTime}>{formatDateTime(entry.createdAt)}</span>
          </div>
          {entry.message && <div className={styles.timelineMessage}>{entry.message}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Handoff Tab ──────────────────────────────────────────────────────────

function HandoffTab({
  run,
  onRefetch,
}: {
  run: RunManifest;
  onRefetch: () => void;
}) {
  const [note, setNote] = useState(run.handoff.confirmationNote);
  const [checklist, setChecklist] = useState<HandoffChecklistItem[]>(run.handoff.checklist);
  const [newItemText, setNewItemText] = useState('');
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    setNote(run.handoff.confirmationNote);
    setChecklist(run.handoff.checklist);
  }, [run.handoff.confirmationNote, run.handoff.checklist]);

  if (!run.requiresHuman) {
    return <div className={styles.empty}>No manual action required for this run.</div>;
  }

  const toggleItem = (id: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const removeItem = (id: string) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  };

  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setChecklist((prev) => [...prev, { id: crypto.randomUUID(), text, done: false }]);
    setNewItemText('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveHandoff(run.id, { confirmationNote: note, checklist });
      onRefetch();
    } catch {
      // error is shown via UI feedback
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    setContinuing(true);
    try {
      await api.continueHuman({
        runId: run.id,
        confirmationNote: note,
        checklist,
      });
      onRefetch();
    } catch {
      // handled silently
    } finally {
      setContinuing(false);
    }
  };

  return (
    <div className={styles.handoffForm}>
      <div className="field">
        <label>Confirmation Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notes about the manual action taken…"
          rows={4}
        />
      </div>

      <div>
        <div className={styles.checklistHeader}>
          <label>Checklist</label>
          <button className="btn btn-ghost btn-xs" onClick={addItem}>
            + Add
          </button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="New checklist item…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem();
            }}
          />
        </div>
        <div className={styles.checklistItems}>
          {checklist.map((item) => (
            <div key={item.id} className={styles.checklistItem}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleItem(item.id)}
              />
              <span
                className={`${styles.checklistItemText}${item.done ? ` ${styles.checklistItemDone}` : ''}`}
              >
                {item.text}
              </span>
              <button className={styles.checklistRemove} onClick={() => removeItem(item.id)}>
                ✕
              </button>
            </div>
          ))}
          {checklist.length === 0 && (
            <small className="text-muted">No checklist items yet.</small>
          )}
        </div>
      </div>

      <div className={styles.handoffActions}>
        <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Handoff'}
        </button>
        <button className="btn btn-primary" onClick={handleContinue} disabled={continuing}>
          {continuing ? 'Continuing…' : 'Continue Run'}
        </button>
      </div>
    </div>
  );
}

// ── Inspector Panel ──────────────────────────────────────────────────────

function InspectorPanel({
  run,
  config,
}: {
  run: RunManifest;
  config: ReturnType<typeof useConfig>['data'];
}) {
  const profileId = run.routing?.launchProfileId ?? config?.defaultProfileId;
  const profile = config?.profiles.find((p) => p.id === profileId);

  const latestError = [...run.history].reverse().find((h) => h.status === 'failed');

  return (
    <>
      <div className={styles.inspectorSection}>
        <span className={styles.inspectorLabel}>Current Stage</span>
        <div className="row gap-sm">
          <span className={styles.inspectorValue}>{formatStage(run.currentStage)}</span>
          <span className={statusPillClass(run.status)}>{run.status}</span>
        </div>
      </div>

      <hr className="divider" />

      <div className={styles.inspectorSection}>
        <span className={styles.inspectorLabel}>Active Profile</span>
        <span className={styles.inspectorValue}>{profile?.name ?? profileId ?? '—'}</span>
        {profile?.webUrl && (
          <small className="text-muted font-mono">{profile.webUrl}</small>
        )}
      </div>

      <hr className="divider" />

      {run.routing?.stageProfileIds && Object.keys(run.routing.stageProfileIds).length > 0 && (
        <>
          <div className={styles.inspectorSection}>
            <span className={styles.inspectorLabel}>Routing</span>
            {Object.entries(run.routing.stageProfileIds).map(([stage, pid]) => (
              <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span className="text-secondary">{formatStage(stage)}</span>
                <span className="font-mono text-muted">{pid}</span>
              </div>
            ))}
          </div>
          <hr className="divider" />
        </>
      )}

      {latestError && (
        <div className={styles.errorCard}>
          <div className={styles.errorTitle}>Latest Error — {formatStage(latestError.stage)}</div>
          <div className={styles.errorMessage}>{latestError.message}</div>
        </div>
      )}

      <div className={styles.inspectorSection}>
        <span className={styles.inspectorLabel}>Suggested Actions</span>
        {run.status === 'failed' && (
          <small className="text-error">Retry from the failed stage or check logs.</small>
        )}
        {run.requiresHuman && (
          <small className="text-warning">Human review needed — go to Handoff tab.</small>
        )}
        {run.status === 'paused' && (
          <small className="text-warning">Run is paused — resume when ready.</small>
        )}
        {run.status === 'running' && (
          <small className="text-accent">Run in progress — monitoring.</small>
        )}
        {run.status === 'completed' && (
          <small className="text-success">Run completed successfully.</small>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Studio Page ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export function Studio() {
  const navigate = useNavigate();
  const { runId } = useParams<{ runId?: string }>();
  const { runs, activeRunId, activeRunPaused, activePreviewUrl } = useRuns();
  const { data: config } = useConfig();

  const selectedRunId = runId ?? activeRunId ?? null;
  const { data: run, loading: runLoading, refetch: refetchRun } = useRun(selectedRunId);
  const {
    data: runDetails,
    loading: runDetailsLoading,
    refetch: refetchRunDetails,
  } = useRunDetails(selectedRunId);

  const [selectedTab, setSelectedTab] = useState<TabId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [retryStage, setRetryStage] = useState<StageName>(STAGE_SEQUENCE[0]);

  // Refetch run detail when SSE indicates the selected run has updated
  const sseRun = selectedRunId ? runs.find((r) => r.id === selectedRunId) : null;
  const sseUpdatedAt = sseRun?.updatedAt;
  useEffect(() => {
    if (sseUpdatedAt) {
      refetchRun();
      refetchRunDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sseUpdatedAt]);

  // Filtered + searched runs
  const filteredRuns = useMemo(() => {
    let result = runs.filter((r) => matchesFilter(r, statusFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.topic.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.provider.toLowerCase().includes(q),
      );
    }
    return result.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [runs, statusFilter, searchQuery]);

  // ── Command bar actions ────────────────────────────────────────────────

  const handlePause = useCallback(async () => {
    try { await api.pauseRun(); } catch { /* noop */ }
  }, []);

  const handleResume = useCallback(async () => {
    try { await api.resumeRun(); } catch { /* noop */ }
  }, []);

  const handleRetry = useCallback(async () => {
    if (!selectedRunId) return;
    try {
      const { runId: newId } = await api.retryRun(selectedRunId, retryStage);
      navigate(`/studio/${newId}`);
    } catch { /* noop */ }
  }, [selectedRunId, retryStage, navigate]);

  const handleContinueHuman = useCallback(async () => {
    if (!selectedRunId) return;
    try {
      await api.continueHuman({ runId: selectedRunId });
      refetchRun();
    } catch { /* noop */ }
  }, [selectedRunId, refetchRun]);

  // ── Determine which command-bar buttons to show ────────────────────────

  const isActiveRun = selectedRunId === activeRunId;
  const showPause = isActiveRun && run?.status === 'running' && !activeRunPaused;
  const showResume = isActiveRun && activeRunPaused;
  const showContinueHuman = run?.requiresHuman === true;
  const showRetry = run != null && (run.status === 'failed' || run.status === 'completed');

  // ── Tab labels ─────────────────────────────────────────────────────────

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'live', label: 'Live Browser' },
    { id: 'outputs', label: 'Outputs' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'handoff', label: 'Handoff' },
  ];

  const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'running', label: 'Running' },
    { id: 'needs_human', label: 'Needs Human' },
    { id: 'completed', label: 'Completed' },
    { id: 'failed', label: 'Failed' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Command Bar ─────────────────────────────────────────── */}
      <div className={styles.commandBar}>
        <div className={styles.commandInfo}>
          {run ? (
            <>
              <span className={styles.commandTopic} title={run.topic}>
                {run.topic}
              </span>
              <span className={styles.commandSep}>|</span>
              <span className={styles.commandMeta}>{formatStage(run.currentStage)}</span>
              <span className={styles.commandSep}>|</span>
              <span className={styles.commandMeta}>{run.provider}</span>
            </>
          ) : (
            <span className={styles.commandMeta}>Select a run</span>
          )}
        </div>

        <div className={styles.commandSpacer} />

        {run && (
          <div className={styles.commandPills}>
            <span className={statusPillClass(run.status)}>{run.status}</span>
          </div>
        )}

        <div className={styles.commandActions}>
          {showPause && (
            <button className="btn btn-secondary btn-sm" onClick={handlePause}>
              Pause
            </button>
          )}
          {showResume && (
            <button className="btn btn-secondary btn-sm" onClick={handleResume}>
              Resume
            </button>
          )}
          {showRetry && (
            <div className={styles.retryGroup}>
              <select
                className={styles.retrySelect}
                value={retryStage}
                onChange={(e) => setRetryStage(e.target.value as StageName)}
              >
                {STAGE_SEQUENCE.map((s) => (
                  <option key={s} value={s}>
                    {formatStage(s)}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={handleRetry}>
                Retry
              </button>
            </div>
          )}
          {showContinueHuman && (
            <button className="btn btn-primary btn-sm" onClick={handleContinueHuman}>
              Continue Human
            </button>
          )}
        </div>
      </div>

      {/* ── Three-column body ───────────────────────────────────── */}
      <div className={styles.body}>
        {/* ── Left: Run Queue ──────────────────────────────────── */}
        <div className={styles.runQueue}>
          <div className={styles.queueHeader}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search runs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className={styles.filterChips}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`${styles.filterChip}${statusFilter === f.id ? ` ${styles.filterChipActive}` : ''}`}
                  onClick={() => setStatusFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.runList}>
            {filteredRuns.length === 0 ? (
              <div className={styles.empty}>No matching runs</div>
            ) : (
              filteredRuns.map((r) => (
                <div
                  key={r.id}
                  className={`${styles.runCard}${r.id === selectedRunId ? ` ${styles.runCardActive}` : ''}`}
                  onClick={() => navigate(`/studio/${r.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/studio/${r.id}`);
                    }
                  }}
                >
                  <div className={styles.runCardTopic} title={r.topic}>
                    {r.topic}
                  </div>
                  <div className={styles.runCardRow}>
                    <span className={statusPillClass(r.status)}>{r.status}</span>
                    <span className={styles.runCardStage}>{formatStage(r.currentStage)}</span>
                  </div>
                  <div className={styles.runCardTime}>{formatTime(r.updatedAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Center: Main Work Area ──────────────────────────── */}
        <div className={styles.mainArea}>
          {!run && !runLoading && (
            <div className={styles.noRun}>Select a run from the queue to get started</div>
          )}
          {runLoading && <div className={styles.loading}>Loading run…</div>}
          {run && (
            <>
              <div className={styles.tabs}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`${styles.tab}${selectedTab === t.id ? ` ${styles.tabActive}` : ''}`}
                    onClick={() => setSelectedTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className={styles.tabContent}>
                {selectedTab === 'overview' && <OverviewTab run={run} />}
                {selectedTab === 'live' && <LiveTab previewUrl={activePreviewUrl} />}
                {selectedTab === 'outputs' && selectedRunId && (
                  <OutputsTab
                    run={run}
                    runId={selectedRunId}
                    details={runDetails}
                    detailsLoading={runDetailsLoading}
                  />
                )}
                {selectedTab === 'timeline' && <TimelineTab run={run} />}
                {selectedTab === 'handoff' && (
                  <HandoffTab run={run} onRefetch={refetchRun} />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right: Inspector ────────────────────────────────── */}
        {run && (
          <div className={styles.inspector}>
            <InspectorPanel run={run} config={config} />
          </div>
        )}
      </div>
    </div>
  );
}
