import { useWorkbench } from '../hooks/useWorkbench';

export function Results() {
  const { state } = useWorkbench();

  const completed = state.tasks.filter((t) => t.status === 'done' || t.status === 'failed');

  return (
    <div>
      <div className="page-header">
        <h2>Results</h2>
        <p>View completed task results and AI responses</p>
      </div>

      {completed.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No completed tasks yet. Start processing to see results here.</p>
          </div>
        </div>
      ) : (
        completed.map((task) => (
          <div className="card" key={task.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3 style={{ flex: 1 }}>{task.question}</h3>
              <span className={`badge badge-${task.status}`} style={{ marginLeft: 12 }}>
                {task.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {task.accountId && <span>Account: {task.accountId.slice(0, 16)}… · </span>}
              {task.startedAt && <span>Started: {new Date(task.startedAt).toLocaleString()} · </span>}
              {task.completedAt && <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>}
            </div>
            {task.status === 'done' && task.answer ? (
              <div className="answer-box">{task.answer}</div>
            ) : task.error ? (
              <div className="answer-box" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                Error: {task.error}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
