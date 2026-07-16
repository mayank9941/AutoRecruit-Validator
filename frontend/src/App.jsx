import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./context/ProtectedRoute";
import AppLayout from "./layouts/AppLayout/AppLayout";
import Login from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import JobProfiles from "./pages/JobProfiles/JobProfiles";
import ProfileDetail from "./pages/ProfileDetail/ProfileDetail";
import CandidatesPage from "./pages/Candidates/Candidates";
import Results from "./pages/Results/Results";
import Review from "./pages/Review/Review";
import Verification from "./pages/Verification/Verification";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <JobProfiles />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles/:profileId"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ProfileDetail />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles/:profileId/candidates"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <CandidatesPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles/:profileId/results"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Results />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles/:profileId/candidates/:candidateId/review"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Review />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles/:profileId/candidates/:candidateId/verification"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Verification />
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
