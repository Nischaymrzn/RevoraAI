import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import Materials from './pages/Materials';
import StudyAI from './pages/StudyAI';
import Progress from './pages/Progress';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        {/* Global toaster — available on every page including auth */}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '14px' },
            duration: 4000,
          }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/materials" element={<ProtectedRoute><Layout><Materials /></Layout></ProtectedRoute>} />
          <Route path="/study"     element={<ProtectedRoute><Layout><StudyAI /></Layout></ProtectedRoute>} />
          <Route path="/progress"  element={<ProtectedRoute><Layout><Progress /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
