import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold mb-6">Login</h1>

        {/* Real Google OAuth: full page redirect to backend */}
        <a
          href="/api/auth/google"
          className="block w-full text-center rounded-md bg-green-50 py-2.5 text-sm font-medium text-gray-800 hover:bg-green-100"
        >
          Login with Google
        </a>

        <p className="my-4 text-center text-xs text-gray-400">or sign up through email</p>

        <input disabled placeholder="Email ID" className="mb-3 w-full rounded-md bg-gray-100 px-3 py-2.5 text-sm" />
        <input disabled type="password" placeholder="Password" className="mb-4 w-full rounded-md bg-gray-100 px-3 py-2.5 text-sm" />
        <button disabled className="w-full rounded-md bg-green-600 py-2.5 text-sm font-medium text-white opacity-60">
          Login
        </button>
        <p className="mt-3 text-center text-xs text-gray-400">Email login is not enabled. Use Google.</p>
      </div>
    </div>
  );
}