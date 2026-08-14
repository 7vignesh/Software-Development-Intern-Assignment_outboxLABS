import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Dashboard layout with left sidebar and main content area.
 * Sidebar contains logo, user info, compose button, and navigation.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab: 'scheduled' | 'sent' | 'compose' = location.pathname.includes('/compose')
    ? 'compose'
    : location.pathname.includes('/sent')
      ? 'sent'
      : 'scheduled';

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Left Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        {/* Logo */}
        <div className="px-5 py-6">
          <span className="text-2xl font-bold text-gray-900">ONB</span>
        </div>

        {/* User Info */}
        <div className="px-5 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-9 h-9 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-white font-medium text-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-gray-600" title="Logout">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Compose Button */}
        <div className="px-5 py-4">
          <button
            onClick={() => navigate('/dashboard/compose')}
            className="w-full py-2.5 border-2 border-green-500 text-green-600 font-medium rounded-lg hover:bg-green-50 transition-colors"
          >
            Compose
          </button>
        </div>

        {/* Navigation */}
        <div className="px-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Core</p>
          <nav className="space-y-1">
            <button
              onClick={() => navigate('/dashboard/scheduled')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'scheduled'
                  ? 'text-green-600 bg-green-50 border-l-3 border-green-500'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {/* Clock icon */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="flex-1 text-left">Scheduled</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                12
              </span>
            </button>

            <button
              onClick={() => navigate('/dashboard/sent')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'sent'
                  ? 'text-green-600 bg-green-50 border-l-3 border-green-500'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {/* Paper plane icon */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span className="flex-1 text-left">Sent</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                785
              </span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-56">
        <Outlet />
      </main>
    </div>
  );
}
