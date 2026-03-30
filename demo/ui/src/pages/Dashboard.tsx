import { useWorkbench } from '../hooks/useWorkbench';
import { api } from '../api/client';

export function Dashboard() {
  const { state, refresh } = useWorkbench();

  const pending = state.tasks.filter((t) => t.status === 'pending').length;
  const running = state.tasks.filter((t) => t.status === 'running').length;
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const failed = state.tasks.filter((t) => t.status === 'failed').length;
  const available = state.accounts.filter((a) => !a.quotaExhausted).length;
  const exhausted = state.accounts.filter((a) => a.quotaExhausted).length;

  const handleStart = async () => {
    await api.start();
    refresh();
  };

  const handleStop = async () => {
    await api.stop();
    refresh();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>AI Chat Automation Workbench Overview</p>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{state.tasks.length}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#60a5fa' }}>{running}</div>
          <div className="stat-label">Running</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{done}</div>
          <div className="stat-label">Done</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{failed}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{available}</div>
          <div className="stat-label">Accounts Available</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{exhausted}</div>
          <div className="stat-label">Quota Exhausted</div>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <h3>Controls</h3>
        <div className="toolbar">
          {state.isRunning ? (
            <button className="btn btn-danger" onClick={handleStop}>
              ⏹ Stop Processing
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={pending === 0 || available === 0}
            >
              ▶ Start Processing
            </button>
          )}
          <button className="btn btn-ghost" onClick={refresh}>
            🔄 Refresh
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 8 }}>
            {state.isRunning ? '🟢 Running' : '⚪ Idle'}
            {state.activeAccountId && ` · Account: ${state.activeAccountId.slice(0, 12)}…`}
          </span>
        </div>
        {pending === 0 && !state.isRunning && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Add questions in the Task Editor and add accounts in the Accounts page to get started.
          </p>
        )}
      </div>

      {/* Recent activity */}
      <div className="card">
        <h3>Recent Tasks</h3>
        {state.tasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet. Go to Task Editor to add questions.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Question</th>
                  <th>Answer (preview)</th>
                </tr>
              </thead>
              <tbody>
                {state.tasks.slice(0, 10).map((task) => (
                  <tr key={task.id}>
                    <td>
                      <span className={`badge badge-${task.status}`}>{task.status}</span>
                    </td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.question}
                    </td>
                    <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {task.answer ? task.answer.slice(0, 100) + '…' : task.error ?? '—'}
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
