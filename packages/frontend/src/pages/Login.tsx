import { getLoginUrl } from '../api/auth';

/**
 * Login page matching Figma design.
 * Centered white card on light gray background with Google OAuth
 * and decorative email/password fields.
 */
export function Login() {
  const handleLogin = () => {
    window.location.href = getLoginUrl();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-8">Login</h1>

        {/* Google Login Button */}
        <button
          onClick={handleLogin}
          className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-green-50 border border-green-100 rounded-lg hover:bg-green-100 transition-colors mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span className="text-gray-700 font-medium">Login with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-sm text-gray-400">or sign up through email</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Decorative Email/Password fields (non-functional) */}
        <div className="space-y-4 mb-6">
          <input
            type="email"
            placeholder="Email ID"
            className="w-full px-4 py-3 bg-gray-100 rounded-lg text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-green-300"
            readOnly
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-3 bg-gray-100 rounded-lg text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-green-300"
            readOnly
          />
        </div>

        {/* Login button (also triggers Google OAuth) */}
        <button
          onClick={handleLogin}
          className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
        >
          Login
        </button>
      </div>
    </div>
  );
}
