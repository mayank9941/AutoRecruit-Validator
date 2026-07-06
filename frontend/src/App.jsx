import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import JobProfile from './pages/JobProfile';
import BulkScreening from './pages/BulkScreening';
import ManualReview from './pages/ManualReview';
import Verification from './pages/Verification';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="/job-profiles" element={<JobProfile />} />
          <Route path="/screening" element={<BulkScreening />} />
          <Route path="/manual-review" element={<ManualReview />} />
          <Route path="/verification" element={<Verification />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
