import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { useConfig, useQuota } from '../hooks/useApi';
import * as api from '../api/client';
import {
  STAGE_SEQUENCE,
  TEXT_STAGE_PROFILE_KEYS,
  type TextStageProfileKey,
  type StartRunRequest,
} from '../types/index';
import styles from './NewRun.module.css';

export function NewRun() {
  const navigate = useNavigate();
  const { data: config, loading: configLoading, error: configError } = useConfig();
  const { data: quota } = useQuota();

  // Form state
  const [topic, setTopic] = useState('');
  const [referencePath, setReferencePath] = useState('');
  const [provider, setProvider] = useState('');
  const [profileId, setProfileId] = useState('');
  const [useMock, setUseMock] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stageOverrides, setStageOverrides] = useState<Partial<Record<TextStageProfileKey, string>>>({});

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Populate defaults from config once loaded
  const defaults = config?.launchDefaults;
  const effectiveProvider = provider || defaults?.provider || '';
  const effectiveProfileId = profileId || config?.defaultProfileId || '';
  const effectiveTopic = topic || defaults?.topic || '';

  // Derive the resolved profile name for display
  const profileName = useMemo(() => {
    if (!config) return effectiveProfileId;
    const p = config.profiles.find((pr) => pr.id === effectiveProfileId);
    return p?.name ?? effectiveProfileId;
  }, [config, effectiveProfileId]);

  // Resolve stage routing for the preview panel
  const resolvedRouting = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of TEXT_STAGE_PROFILE_KEYS) {
      const override = stageOverrides[key];
      const defaultStageProfile = defaults?.stageProfileIds?.[key];
      result[key] = override || defaultStageProfile || effectiveProfileId;
    }
    return result;
  }, [stageOverrides, defaults, effectiveProfileId]);

  // Warnings for the preview
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (useMock) w.push('Mock mode enabled — no real browser automation');
    if (!effectiveTopic) w.push('Topic is required');
    if (!effectiveProvider) w.push('Provider is required');
    return w;
  }, [useMock, effectiveTopic, effectiveProvider]);

  const canSubmit = effectiveTopic.trim().length > 0 && effectiveProvider.trim().length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);

    const req: StartRunRequest = {
      topic: effectiveTopic.trim(),
      provider: effectiveProvider.trim(),
      profileId: effectiveProfileId,
      referencePath: referencePath.trim() || undefined,
      useMock: useMock || undefined,
    };

    // Only include stage overrides that differ from empty
    const overrideEntries = Object.entries(stageOverrides).filter(
      ([, v]) => v && v.length > 0,
    );
    if (overrideEntries.length > 0) {
      req.stageProfileIds = Object.fromEntries(overrideEntries) as Partial<Record<TextStageProfileKey, string>>;
    }

    try {
      const { runId } = await api.startRun(req);
      navigate(`/studio/${runId}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start run');
      setSubmitting(false);
    }
  }

  if (configLoading) {
    return <div className={styles.loading}>Loading configuration…</div>;
  }

  if (configError) {
    return (
      <div className={styles.loading}>
        <p className="text-error">Failed to load configuration: {configError.message}</p>
      </div>
    );
  }

  const profiles = config?.profiles ?? [];

  return (
    <div className={styles.page}>
      {/* ── Left panel: form ─────────────────────────────────── */}
      <div className={styles.formPanel}>
        <h1>Create New Run</h1>
        <p className="text-secondary">Configure and launch a video generation pipeline.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Daily Quota */}
          {quota && quota.remaining === 0 && (
            <div className={styles.warningItem} style={{ padding: 'var(--space-sm)', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)' }}>
              <AlertTriangle size={14} />
              Daily run limit reached ({quota.dailyRunLimit}). Try again tomorrow or increase the limit in Settings → System.
            </div>
          )}
          {quota && quota.remaining > 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Daily quota: {quota.todayRunCount} / {quota.dailyRunLimit} used ({quota.remaining} remaining)
            </p>
          )}
          {/* Topic */}
          <div className="field">
            <label htmlFor="nr-topic">Topic *</label>
            <input
              id="nr-topic"
              type="text"
              placeholder={defaults?.topic || 'Enter video topic…'}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          {/* Reference File */}
          <div className="field">
            <label htmlFor="nr-ref">Reference File Path</label>
            <input
              id="nr-ref"
              type="text"
              placeholder={defaults?.referencePath || 'Optional path to reference video'}
              value={referencePath}
              onChange={(e) => setReferencePath(e.target.value)}
            />
            <span className="field-hint">Path to a reference video for style matching</span>
          </div>

          {/* Provider */}
          <div className="field">
            <label htmlFor="nr-provider">Provider *</label>
            <input
              id="nr-provider"
              type="text"
              placeholder={defaults?.provider || 'e.g. gemini, chatgpt'}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>

          {/* Browser Profile */}
          <div className="field">
            <label htmlFor="nr-profile">Browser Profile</label>
            <select
              id="nr-profile"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              <option value="">
                Default ({profiles.find((p) => p.id === config?.defaultProfileId)?.name ?? config?.defaultProfileId ?? '—'})
              </option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mock Mode */}
          <label className="toggle">
            <input
              type="checkbox"
              checked={useMock}
              onChange={(e) => setUseMock(e.target.checked)}
            />
            <span className="toggle-track" />
            Mock Mode
          </label>

          {/* Advanced Section */}
          <div>
            <button
              type="button"
              className={`${styles.advancedToggle} ${advancedOpen ? styles.advancedOpen : ''}`}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <ChevronDown size={14} />
              Advanced — Stage Routing
            </button>

            {advancedOpen && (
              <div className={styles.advancedBody}>
                {TEXT_STAGE_PROFILE_KEYS.map((stageKey) => (
                  <div className="field" key={stageKey}>
                    <label htmlFor={`nr-stage-${stageKey}`}>
                      {stageKey.replace(/_/g, ' ')}
                    </label>
                    <select
                      id={`nr-stage-${stageKey}`}
                      value={stageOverrides[stageKey] ?? ''}
                      onChange={(e) =>
                        setStageOverrides((prev) => ({
                          ...prev,
                          [stageKey]: e.target.value,
                        }))
                      }
                    >
                      <option value="">
                        Default ({profiles.find((p) => p.id === (defaults?.stageProfileIds?.[stageKey] || effectiveProfileId))?.name ?? '—'})
                      </option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className={styles.submitArea}>
            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={!canSubmit}
            >
              {submitting ? 'Starting…' : 'Start Run'}
            </button>
            {submitError && <p className={styles.submitError}>{submitError}</p>}
          </div>
        </form>
      </div>

      {/* ── Right panel: preview ──────────────────────────────── */}
      <div className={styles.previewPanel}>
        <h2>Run Preview</h2>

        {/* Execution path */}
        <div className={styles.previewSection}>
          <h3>Execution Path</h3>
          <ul className={styles.previewList}>
            <li>{STAGE_SEQUENCE.length} stages in pipeline</li>
            <li>Profile: {profileName}</li>
            <li>Provider: {effectiveProvider || '(not set)'}</li>
          </ul>
        </div>

        {/* Stage routing */}
        <div className={styles.previewSection}>
          <h3>Stage Routing</h3>
          <table className={styles.routingTable}>
            <tbody>
              {Object.entries(resolvedRouting).map(([stage, pId]) => {
                const p = profiles.find((pr) => pr.id === pId);
                return (
                  <tr key={stage}>
                    <td>{stage.replace(/_/g, ' ')}</td>
                    <td>{p?.name ?? pId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className={styles.previewSection}>
            <h3>Warnings</h3>
            {warnings.map((w) => (
              <div key={w} className={styles.warningItem}>
                <AlertTriangle size={14} />
                {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
