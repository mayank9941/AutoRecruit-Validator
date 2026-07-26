import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './context/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';

import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import JobProfilesPage from './pages/JobProfiles/JobProfilesPage';
import ProfileDetailPage from './pages/JobProfiles/ProfileDetailPage';
import CandidatePage from './pages/Candidate/CandidatePage';
import ReportsPage from './pages/Reports/ReportsPage';
import SettingsPage from './pages/Settings/SettingsPage';

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
}

function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/recruitment" element={<Protected><JobProfilesPage /></Protected>} />
            <Route path="/recruitment/:profileId" element={<Protected><ProfileDetailPage /></Protected>} />
            <Route path="/candidate/:profileId/:candidateId" element={<Protected><CandidatePage /></Protected>} />
            <Route path="/reports/:profileId" element={<Protected><ReportsPage /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
