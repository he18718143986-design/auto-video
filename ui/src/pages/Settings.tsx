import { useState } from 'react';
import { useConfig, usePrompts, useSelectorHistory, useQuota } from '../hooks/useApi';
import * as api from '../api/client';
import type { BrowserProfileConfig, AppConfig, SelectorDebugSnapshot } from '../types';

type SettingsTab = 'profiles' | 'routing' | 'prompts' | 'selectors' | 'system';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'profiles', label: 'Browser Profiles' },
  { id: 'routing', label: 'Stage Routing' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'selectors', label: 'Selectors' },
  { id: 'system', label: 'System' },
];

const TEXT_STAGE_KEYS = ['capability_assessment', 'research', 'script', 'qa', 'storyboard'] as const;

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>('profiles');
  const { data: config, refetch: refetchConfig } = useConfig();
  const { data: prompts, refetch: refetchPrompts } = usePrompts();
  const { data: selectorHistory } = useSelectorHistory();

  return (
    <div className="stack" style={{ padding: 'var(--space-xl)', maxWidth: 1100 }}>
      <div>
        <h2>Settings</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
          Configure browser profiles, prompts, selectors, and system options.
        </p>
      </div>

      <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profiles' && config && (
        <ProfilesTab config={config} onSaved={refetchConfig} />
      )}
      {tab === 'routing' && config && (
        <RoutingTab config={config} onSaved={refetchConfig} />
      )}
      {tab === 'prompts' && prompts && (
        <PromptsTab prompts={prompts} onSaved={refetchPrompts} />
      )}
      {tab === 'selectors' && (
        <SelectorsTab config={config ?? null} snapshots={selectorHistory ?? []} />
      )}
      {tab === 'system' && <SystemTab config={config ?? null} />}

      {!config && tab !== 'system' && (
        <p style={{ color: 'var(--text-muted)' }}>Loading configuration...</p>
      )}
    </div>
  );
}

/* ── Profiles Tab ──────────────────────────────────────────── */
function ProfilesTab({ config, onSaved }: { config: AppConfig; onSaved: () => void }) {
  const [selectedId, setSelectedId] = useState(config.profiles[0]?.id ?? '');
  const profile = config.profiles.find((p) => p.id === selectedId);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) return;
    const fd = new FormData(e.currentTarget);
    const str = (key: string) => (fd.get(key) as string | null) ?? '';
    const num = (key: string, fallback: number) => {
      const v = Number(fd.get(key));
      return v > 0 ? v : fallback;
    };
    const updated: BrowserProfileConfig = {
      ...profile,
      name: str('name') || profile.name,
      webUrl: str('webUrl') || profile.webUrl,
      promptSelector: str('promptSelector'),
      readySelector: str('readySelector'),
      uploadSelector: str('uploadSelector'),
      responseSelector: str('responseSelector'),
      sendButtonSelector: str('sendButtonSelector'),
      userDataDir: str('userDataDir'),
      headless: fd.get('headless') === 'on',
      allowManualLogin: fd.get('allowManualLogin') === 'on',
      navigationTimeoutMs: num('navigationTimeoutMs', profile.navigationTimeoutMs),
      readyTimeoutMs: num('readyTimeoutMs', profile.readyTimeoutMs),
      responseTimeoutMs: num('responseTimeoutMs', profile.responseTimeoutMs),
      manualLoginTimeoutMs: num('manualLoginTimeoutMs', profile.manualLoginTimeoutMs),
    };
    const newProfiles = config.profiles.map((p) => (p.id === selectedId ? updated : p));
    setSaving(true);
    try {
      await api.saveConfig({ ...config, profiles: newProfiles });
      setStatus('Saved');
      onSaved();
    } catch {
      setStatus('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddProfile = async () => {
    const nextIndex = config.profiles.length + 1;
    const newId = `profile-${nextIndex}`;
    const newProfile: BrowserProfileConfig = {
      id: newId,
      name: `New Profile ${nextIndex}`,
      webUrl: 'https://your-chat-page.example',
      promptSelector: 'textarea',
      responseSelector: '[data-message-author-role="assistant"]',
      uploadSelector: 'input[type="file"]',
      sendButtonSelector: '',
      readySelector: 'textarea',
      userDataDir: `.browser-profile/${newId}`,
      headless: false,
      allowManualLogin: true,
      navigationTimeoutMs: 45000,
      readyTimeoutMs: 10000,
      responseTimeoutMs: 120000,
      manualLoginTimeoutMs: 180000,
    };
    try {
      await api.saveConfig({ ...config, profiles: [...config.profiles, newProfile] });
      setSelectedId(newId);
      setStatus('Profile added');
      onSaved();
    } catch {
      setStatus('Add failed');
    }
  };

  const handleDeleteProfile = async () => {
    if (config.profiles.length <= 1) {
      setStatus('Cannot delete the last profile');
      return;
    }
    if (selectedId === config.defaultProfileId) {
      setStatus('Cannot delete the default profile');
      return;
    }
    const newProfiles = config.profiles.filter((p) => p.id !== selectedId);
    try {
      await api.saveConfig({ ...config, profiles: newProfiles });
      setSelectedId(newProfiles[0]?.id ?? '');
      setStatus('Profile deleted');
      onSaved();
    } catch {
      setStatus('Delete failed');
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ gap: 'var(--space-md)', alignItems: 'flex-end' }}>
        <label className="stack" style={{ gap: 'var(--space-xs)', flex: 1 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Edit Profile</span>
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setStatus(''); }}>
            {config.profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.id}</option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 'var(--space-xs)', flex: 1 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Default Profile</span>
          <select
            value={config.defaultProfileId}
            onChange={async (e) => {
              await api.saveConfig({ ...config, defaultProfileId: e.target.value });
              onSaved();
            }}
          >
            {config.profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.id}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ gap: 'var(--space-sm)' }}>
        <button className="btn btn-secondary" onClick={handleAddProfile}>
          + Add Profile
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleDeleteProfile}
          disabled={config.profiles.length <= 1 || selectedId === config.defaultProfileId}
          style={{ opacity: (config.profiles.length <= 1 || selectedId === config.defaultProfileId) ? 0.5 : 1 }}
        >
          Delete Profile
        </button>
        {status && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{status}</span>}
      </div>
      {profile && (
        <form className="card stack" onSubmit={handleSave}>
          <div className="grid-2">
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Profile Name</span>
              <input name="name" defaultValue={profile.name} />
            </label>
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>User Data Dir</span>
              <input name="userDataDir" defaultValue={profile.userDataDir} />
            </label>
          </div>
          <label className="stack" style={{ gap: 'var(--space-xs)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Target Web URL</span>
            <input name="webUrl" defaultValue={profile.webUrl} />
          </label>
          <div className="grid-2">
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Prompt Selector</span>
              <input name="promptSelector" defaultValue={profile.promptSelector} />
            </label>
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ready Selector</span>
              <input name="readySelector" defaultValue={profile.readySelector} />
            </label>
          </div>
          <div className="grid-2">
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Upload Selector</span>
              <input name="uploadSelector" defaultValue={profile.uploadSelector} />
            </label>
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Response Selector</span>
              <input name="responseSelector" defaultValue={profile.responseSelector} />
            </label>
          </div>
          <label className="stack" style={{ gap: 'var(--space-xs)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Send Button Selector</span>
            <input name="sendButtonSelector" defaultValue={profile.sendButtonSelector} />
          </label>
          <div className="grid-2">
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nav Timeout (ms)</span>
              <input name="navigationTimeoutMs" type="number" defaultValue={profile.navigationTimeoutMs} />
            </label>
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ready Timeout (ms)</span>
              <input name="readyTimeoutMs" type="number" defaultValue={profile.readyTimeoutMs} />
            </label>
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Response Timeout (ms)</span>
              <input name="responseTimeoutMs" type="number" defaultValue={profile.responseTimeoutMs} />
            </label>
            <label className="stack" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manual Login Timeout (ms)</span>
              <input name="manualLoginTimeoutMs" type="number" defaultValue={profile.manualLoginTimeoutMs} />
            </label>
          </div>
          <div className="row" style={{ gap: 'var(--space-lg)' }}>
            <label className="row" style={{ gap: 'var(--space-sm)', alignItems: 'center' }}>
              <input name="headless" type="checkbox" defaultChecked={profile.headless} />
              <span style={{ fontSize: '0.85rem' }}>Headless</span>
            </label>
            <label className="row" style={{ gap: 'var(--space-sm)', alignItems: 'center' }}>
              <input name="allowManualLogin" type="checkbox" defaultChecked={profile.allowManualLogin} />
              <span style={{ fontSize: '0.85rem' }}>Allow Manual Login</span>
            </label>
          </div>
          <div className="row" style={{ gap: 'var(--space-sm)', alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            {status && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{status}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

/* ── Routing Tab ──────────────────────────────────────────── */
function RoutingTab({ config, onSaved }: { config: AppConfig; onSaved: () => void }) {
  const defaults = config.launchDefaults?.stageProfileIds ?? {};
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleModeChange = async (mode: string) => {
    setSaving(true);
    setSaveError('');
    try {
      await api.saveConfig({ ...config, rotationMode: mode as AppConfig['rotationMode'] });
      onSaved();
    } catch {
      setSaveError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = async (stage: string, profileId: string) => {
    const newIds = { ...defaults, [stage]: profileId || undefined };
    if (!profileId) delete newIds[stage as keyof typeof newIds];
    setSaving(true);
    setSaveError('');
    try {
      await api.saveConfig({
        ...config,
        launchDefaults: { ...config.launchDefaults, stageProfileIds: newIds },
      });
      onSaved();
    } catch {
      setSaveError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card stack">
      <div className="stack" style={{ gap: 'var(--space-sm)' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rotation Mode</span>
        <div className="row" style={{ gap: 'var(--space-sm)' }}>
          <button
            className={`btn ${config.rotationMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleModeChange('manual')}
            disabled={saving}
          >
            Manual
          </button>
          <button
            className={`btn ${config.rotationMode === 'round-robin' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleModeChange('round-robin')}
            disabled={saving}
          >
            Round-Robin
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
          {config.rotationMode === 'round-robin'
            ? 'Stages without explicit routing will automatically rotate across all configured profiles to distribute AI chat quota usage.'
            : 'Stages without explicit routing will use the default profile. Set per-stage overrides below.'}
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-md)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Override which browser profile each text stage uses. Leave blank to use {config.rotationMode === 'round-robin' ? 'automatic rotation' : 'the default profile'}.
        </p>
        {TEXT_STAGE_KEYS.map((stage) => (
          <div key={stage} className="row" style={{ gap: 'var(--space-md)', alignItems: 'center' }}>
            <span style={{ minWidth: 180, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {stage.replace(/_/g, ' ')}
            </span>
            <select
              value={defaults[stage] ?? ''}
              onChange={(e) => handleChange(stage, e.target.value)}
              disabled={saving}
              style={{ flex: 1 }}
            >
              <option value="">{config.rotationMode === 'round-robin' ? 'Auto (round-robin)' : `Default (${config.profiles.find(p => p.id === config.defaultProfileId)?.name ?? 'none'})`}</option>
              {config.profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {saveError && <p style={{ fontSize: '0.85rem', color: 'var(--status-error)' }}>{saveError}</p>}
    </div>
  );
}

/* ── Prompts Tab ──────────────────────────────────────────── */
function PromptsTab({ prompts, onSaved }: { prompts: Record<string, string>; onSaved: () => void }) {
  const keys = Object.keys(prompts);
  const [selected, setSelected] = useState(keys[0] ?? '');
  const [content, setContent] = useState(prompts[selected] ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const handleSelect = (key: string) => {
    setSelected(key);
    setContent(prompts[key] ?? '');
    setStatus('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.savePrompt(selected, content);
      setStatus('Saved');
      onSaved();
    } catch {
      setStatus('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <select value={selected} onChange={(e) => handleSelect(e.target.value)}>
        {keys.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <textarea
        rows={18}
        value={content}
        onChange={(e) => { setContent(e.target.value); setStatus(''); }}
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
      />
      <div className="row" style={{ gap: 'var(--space-sm)', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selected}>
          {saving ? 'Saving...' : 'Save Prompt'}
        </button>
        {status && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{status}</span>}
      </div>
    </div>
  );
}

/* ── Selectors Tab ──────────────────────────────────────────── */
function SelectorsTab({ config, snapshots }: { config: AppConfig | null; snapshots: SelectorDebugSnapshot[] }) {
  const [profileId, setProfileId] = useState(config?.defaultProfileId ?? '');
  const [result, setResult] = useState<string>('');
  const [running, setRunning] = useState(false);

  const handleDebug = async () => {
    if (!profileId) return;
    setRunning(true);
    try {
      const snap = await api.debugSelectors(profileId);
      setResult(JSON.stringify(snap, null, 2));
    } catch (err) {
      setResult(String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Selector Debugger</h3>
        <div className="row" style={{ gap: 'var(--space-md)', alignItems: 'flex-end' }}>
          <label className="stack" style={{ gap: 'var(--space-xs)', flex: 1 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Profile</span>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {(config?.profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={handleDebug} disabled={running}>
            {running ? 'Running...' : 'Run Debug'}
          </button>
        </div>
        {result && (
          <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: '0.8rem', margin: 0 }}>{result}</pre>
        )}
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Snapshot History</h3>
        {snapshots.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No snapshots yet.</p>}
        {snapshots.map((s) => (
          <div key={s.id} style={{ padding: 'var(--space-sm)', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
            <strong>{s.profileId}</strong> &middot; {new Date(s.createdAt).toLocaleString()} &middot; {s.entries.length} selectors
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── System Tab ──────────────────────────────────────────── */
function SystemTab({ config }: { config: AppConfig | null }) {
  const { data: quota, refetch: refetchQuota } = useQuota();
  const [limit, setLimit] = useState<string>(String(config?.dailyRunLimit ?? 3));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const handleSaveLimit = async () => {
    if (!config) return;
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1) {
      setStatus('Limit must be at least 1.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      await api.saveConfig({ ...config, dailyRunLimit: parsed });
      setStatus('Saved');
      refetchQuota();
    } catch {
      setStatus('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Daily Run Quota</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
        Limit the number of video runs per day to control costs when using free AI chat quotas.
      </p>
      <div className="grid-2">
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today{"'"}s Usage</span>
          <strong style={{ fontSize: '0.9rem' }}>
            {quota ? `${quota.todayRunCount} / ${quota.dailyRunLimit}` : '…'}
          </strong>
        </div>
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remaining</span>
          <strong style={{ fontSize: '0.9rem', color: quota && quota.remaining === 0 ? 'var(--status-error)' : undefined }}>
            {quota ? quota.remaining : '…'}
          </strong>
        </div>
      </div>
      <div className="row" style={{ gap: 'var(--space-sm)', alignItems: 'flex-end' }}>
        <label className="stack" style={{ gap: 'var(--space-xs)', flex: 1 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Daily Run Limit</span>
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => { setLimit(e.target.value); setStatus(''); }}
          />
        </label>
        <button className="btn btn-primary" onClick={handleSaveLimit} disabled={saving}>
          {saving ? 'Saving...' : 'Save Limit'}
        </button>
        {status && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{status}</span>}
      </div>

      <h3 style={{ margin: 0, marginTop: 'var(--space-lg)' }}>System Information</h3>
      <div className="grid-2">
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>API Server</span>
          <strong style={{ fontSize: '0.9rem' }}>{window.location.origin.includes('localhost') ? 'http://127.0.0.1:3210' : window.location.origin}</strong>
        </div>
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profiles</span>
          <strong style={{ fontSize: '0.9rem' }}>{config?.profiles.length ?? 0} configured</strong>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Additional system diagnostics (FFmpeg, Playwright, local directories) will be available in a future update.
      </p>
    </div>
  );
}
