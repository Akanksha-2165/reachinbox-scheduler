import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEmails } from '../hooks/useEmails';
import Sidebar from '../components/Sidebar';
import EmailRow from '../components/EmailRow';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const tab = useLocation().pathname === '/sent' ? 'sent' : 'scheduled';
  const { data, isLoading, isError, error } = useEmails(tab);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const sorted = [...(data ?? [])].sort((a, b) =>
    tab === 'sent'
      ? +new Date(b.sentAt ?? b.scheduledAt) - +new Date(a.sentAt ?? a.scheduledAt)
      : +new Date(a.scheduledAt) - +new Date(b.scheduledAt)
  );

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-gray-200 p-3">
          <input
            placeholder="Search"
            className="w-full max-w-xl rounded-md bg-gray-100 px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          )}
          {isError && (
            <div className="p-8 text-center text-red-600">
              Failed to load emails: {(error as Error).message}
            </div>
          )}
          {!isLoading && !isError && sorted.length === 0 && (
            <div className="p-16 text-center text-gray-400">
              No {tab} emails yet.
            </div>
          )}
          {sorted.map((e) => (
            <EmailRow key={e.id} email={e} />
          ))}
        </div>
      </main>
    </div>
  );
}