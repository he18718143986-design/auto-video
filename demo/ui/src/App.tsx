import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TaskEditor } from './pages/TaskEditor';
import { AccountManager } from './pages/AccountManager';
import { Results } from './pages/Results';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<TaskEditor />} />
          <Route path="accounts" element={<AccountManager />} />
          <Route path="results" element={<Results />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
