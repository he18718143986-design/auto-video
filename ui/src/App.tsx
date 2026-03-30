import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { NewRun } from './pages/NewRun';
import { Studio } from './pages/Studio';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="new-run" element={<NewRun />} />
          <Route path="studio" element={<Studio />} />
          <Route path="studio/:runId" element={<Studio />} />
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
