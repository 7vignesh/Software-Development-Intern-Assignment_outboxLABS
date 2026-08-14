import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Header } from './Header';
import { TabNavigation } from './TabNavigation';

/**
 * Dashboard layout composing Header, TabNavigation, content area, and Compose button.
 * Manages active tab state based on the current URL path.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab: 'scheduled' | 'sent' =
    location.pathname.includes('/sent') ? 'sent' : 'scheduled';

  const handleTabChange = (tab: 'scheduled' | 'sent') => {
    navigate(`/dashboard/${tab}`);
  };

  const handleCompose = () => {
    navigate('/dashboard/compose');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={logout} />
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          <button
            onClick={handleCompose}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
          >
            Compose New Email
          </button>
        </div>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
