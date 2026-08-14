import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Scheduled } from './pages/Scheduled';
import { Sent } from './pages/Sent';
import { Compose } from './pages/Compose';

/**
 * Root application component with routing configuration.
 * - / redirects to /dashboard/scheduled
 * - /login renders the Login page
 * - /dashboard/* is protected and uses Layout with nested routes
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard/scheduled" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard/scheduled" replace />} />
            <Route path="scheduled" element={<Scheduled />} />
            <Route path="sent" element={<Sent />} />
            <Route path="compose" element={<Compose />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
