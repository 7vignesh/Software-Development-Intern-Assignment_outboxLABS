import type { User } from '../types';

interface HeaderProps {
  user: User;
  onLogout: () => void;
}

/**
 * Dashboard header showing user info and logout button.
 */
export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-3">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-9 h-9 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-gray-800">{user.name}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
      </div>

      <button
        onClick={onLogout}
        className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
      >
        Logout
      </button>
    </header>
  );
}
