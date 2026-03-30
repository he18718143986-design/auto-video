import { useEffect, useState } from 'react';
import { useRuns, useRunDetails } from '../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import type { RunSummary } from '../types';
import { RunAssetsPanel } from '../components/RunAssetsPanel';
import styles from './Library.module.css';

const STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  needs_human: 'Needs Human',
};

export function Library() {
  const { runs } = useRuns();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'runs' | 'assets'>('runs');
  const [search, setSearch] = useState('');
  const [selectedAssetRunId, setSelectedAssetRunId] = useState<string | null>(null);
  const filtered = runs.filter(
    (r) =>
      !search ||
      r.topic.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase()),
  );

  const sortedRuns = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  useEffect(() => {
    if (tab !== 'assets') return;
    if (sortedRuns.length === 0) {
      setSelectedAssetRunId(null);
      return;
    }
    if (!selectedAssetRunId || !sortedRuns.some((run) => run.id === selectedAssetRunId)) {
      setSelectedAssetRunId(sortedRuns[0].id);
    }
  }, [tab, sortedRuns, selectedAssetRunId]);

  const selectedAssetRun = selectedAssetRunId
    ? runs.find((run) => run.id === selectedAssetRunId) ?? null
    : null;
  const {
    data: assetDetails,
    loading: assetDetailsLoading,
    refetch: refetchAssetDetails,
  } = useRunDetails(tab === 'assets' ? selectedAssetRunId : null);
  const selectedAssetRunUpdatedAt = selectedAssetRun?.updatedAt;

  useEffect(() => {
    if (tab === 'assets' && selectedAssetRunUpdatedAt) {
      refetchAssetDetails();
    }
  }, [tab, selectedAssetRunUpdatedAt, refetchAssetDetails]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Library</h2>
        <p>
          Browse past runs and generated assets.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`btn ${tab === 'runs' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('runs')}
        >
          Runs
        </button>
        <button
          className={`btn ${tab === 'assets' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('assets')}
        >
          Assets
        </button>
      </div>

      <input
        className={styles.search}
        type="text"
        placeholder="Search runs by topic or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {tab === 'runs' && (
        <div className={styles.runsList}>
            {sortedRuns.length === 0 && (
              <p className={styles.empty}>No runs found.</p>
            )}
            {sortedRuns.map((run: RunSummary) => (
              <div
                key={run.id}
                className={`card ${styles.runCard}`}
                onClick={() => navigate(`/studio/${run.id}`)}
              >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ color: 'var(--text-bright)' }}>{run.topic}</strong>
                    <p className={styles.runMeta}>
                      {run.id} &middot; {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`pill pill-${run.status === 'needs_human' ? 'warning' : run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'running'}`}>
                    {STATUS_LABELS[run.status] ?? run.status}
                  </span>
                </div>
                {run.currentStage && (
                  <p className={styles.runStage}>
                    Stage: {run.currentStage.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}

      {tab === 'assets' && (
        <div className={styles.assetShell}>
          <div className={styles.assetRunList}>
            <h3>Runs</h3>
            <div className={styles.assetRunItems}>
              {sortedRuns.length === 0 && (
                <div className={styles.empty}>No runs available for asset browsing.</div>
              )}
              {sortedRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className={`${styles.assetRunButton}${selectedAssetRunId === run.id ? ` ${styles.assetRunButtonActive}` : ''}`}
                  onClick={() => setSelectedAssetRunId(run.id)}
                >
                  <span className={styles.assetRunTopic}>{run.topic}</span>
                  <span className={styles.assetRunMeta}>
                    {run.status} · {new Date(run.updatedAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.assetBrowser}>
            {selectedAssetRun ? (
              <>
                <div className={styles.assetHeader}>
                  <div>
                    <h3>{selectedAssetRun.topic}</h3>
                    <p>
                      Browse screenshots, generated media, subtitles, manifests, and other outputs for this run.
                    </p>
                  </div>
                  <div className={styles.assetHeaderMeta}>
                    <span className={`pill pill-${selectedAssetRun.status === 'needs_human' ? 'warning' : selectedAssetRun.status === 'completed' ? 'success' : selectedAssetRun.status === 'failed' ? 'error' : 'running'}`}>
                      {STATUS_LABELS[selectedAssetRun.status] ?? selectedAssetRun.status}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/studio/${selectedAssetRun.id}`)}
                    >
                      Open in Studio
                    </button>
                  </div>
                </div>

                <RunAssetsPanel
                  runId={selectedAssetRun.id}
                  details={assetDetails}
                  loading={assetDetailsLoading}
                  emptyMessage="This run does not have browsable screenshots or media yet."
                />
              </>
            ) : (
              <div className={styles.empty}>Select a run to browse its assets.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
