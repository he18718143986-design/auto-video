import { useState } from 'react';
import { useWorkbench } from '../hooks/useWorkbench';
import { api } from '../api/client';

export function TaskEditor() {
  const { state, refresh } = useWorkbench();
  const [text, setText] = useState('');

  const handleAdd = async () => {
    const questions = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (questions.length === 0) return;
    await api.addTasks(questions);
    setText('');
    refresh();
  };

  const handleRemove = async (taskId: string) => {
    await api.removeTask(taskId);
    refresh();
  };

  const handleClear = async () => {
    await api.clearTasks();
    refresh();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Task Editor</h2>
        <p>Add questions to the processing queue (one per line)</p>
      </div>

      {/* Add questions */}
      <div className="card">
        <h3>Add Questions</h3>
        <div className="form-group">
          <label>Questions (one per line)</label>
          <textarea
            className="form-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"What is quantum computing?\nHow does machine learning work?\nExplain the concept of neural networks."}
            rows={8}
          />
        </div>
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleAdd} disabled={!text.trim()}>
            ➕ Add to Queue
          </button>
          <button className="btn btn-ghost" onClick={handleClear} disabled={state.tasks.length === 0}>
            🗑 Clear All
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {state.tasks.length} task(s) in queue
          </span>
        </div>
      </div>

      {/* Task list */}
      <div className="card">
        <h3>Task Queue</h3>
        {state.tasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks in the queue. Add questions above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Question</th>
                  <th>Account</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <span className={`badge badge-${task.status}`}>{task.status}</span>
                    </td>
                    <td>{task.question}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {task.accountId ? task.accountId.slice(0, 12) + '…' : '—'}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRemove(task.id)}
                        disabled={task.status === 'running'}
                      >
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
