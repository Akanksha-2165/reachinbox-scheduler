import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="p-8">
      <div className="flex items-center gap-3">
        {user.avatar && <img src={user.avatar} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />}
        <div>
          <div className="font-medium">{user.name}</div>
          <div className="text-sm text-gray-500">{user.email}</div>
        </div>
        <button onClick={logout} className="ml-auto rounded-md border px-3 py-1.5 text-sm hover:bg-gray-100">
          Logout
        </button>
      </div>
    </div>
  );
}