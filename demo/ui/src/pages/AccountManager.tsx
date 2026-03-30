import { useState } from 'react';
import { useWorkbench } from '../hooks/useWorkbench';
import { api } from '../api/client';
import type { ProviderId } from '../types';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi' },
];

export function AccountManager() {
  const { state, refresh } = useWorkbench();
  const [provider, setProvider] = useState<ProviderId>('chatgpt');
  const [label, setLabel] = useState('');
  const [profileDir, setProfileDir] = useState('');

  const handleAdd = async () => {
    if (!label.trim() || !profileDir.trim()) return;
    await api.addAccount(provider, label.trim(), profileDir.trim());
    setLabel('');
    setProfileDir('');
    refresh();
  };

  const handleRemove = async (accountId: string) => {
    await api.removeAccount(accountId);
    refresh();
  };

  const handleResetQuotas = async () => {
    await api.resetQuotas();
    refresh();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Account Manager</h2>
        <p>Manage browser profile accounts for different AI providers</p>
      </div>

      {/* Add account */}
      <div className="card">
        <h3>Add Account</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, alignItems: 'end' }}>
          <div className="form-group">
            <label>Provider</label>
            <select
              className="form-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Label</label>
            <input
              className="form-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My ChatGPT Account"
            />
          </div>
          <div className="form-group">
            <label>Browser Profile Directory</label>
            <input
              className="form-input"
              value={profileDir}
              onChange={(e) => setProfileDir(e.target.value)}
              placeholder="/path/to/browser-profile"
            />
          </div>
        </div>
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleAdd} disabled={!label.trim() || !profileDir.trim()}>
            ➕ Add Account
          </button>
          <button className="btn btn-ghost" onClick={handleResetQuotas} disabled={state.accounts.length === 0}>
            🔄 Reset All Quotas
          </button>
        </div>
      </div>

      {/* Account list */}
      <div className="card">
        <h3>Registered Accounts ({state.accounts.length})</h3>
        {state.accounts.length === 0 ? (
          <div className="empty-state">
            <p>No accounts registered. Add one above to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Label</th>
                  <th>Profile</th>
                  <th>Quota</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>
                      <span className={`provider-tag provider-${acc.provider}`}>{acc.provider}</span>
                    </td>
                    <td>{acc.label}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.profileDir}
                    </td>
                    <td>
                      {acc.quotaExhausted ? (
                        <span className="badge badge-quota">Exhausted</span>
                      ) : (
                        <span className="badge badge-done">Available</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(acc.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
