import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCounts } from '../hooks/useEmails';
import { useSlackStatus } from '../hooks/useSlack';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { data: counts } = useCounts();
  const navigate = useNavigate();
  const { data: slack } = useSlackStatus();

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between rounded-md px-3 py-2 text-sm ${
      isActive ? 'bg-green-50 font-medium text-green-700' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white p-4">
      <div className="mb-4 text-2xl font-black tracking-tight">ONB</div>

      <div className="mb-3 flex items-center gap-2 rounded-md bg-gray-50 p-2">
        {user?.avatar && (
          <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user?.name}</div>
          <div className="truncate text-xs text-gray-500">{user?.email}</div>
        </div>
      </div>

      <button
        onClick={() => navigate('/compose')}
        className="mb-4 w-full rounded-full border border-green-600 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
      >
        Compose
      </button>

      <nav className="space-y-1">
        <NavLink to="/" end className={tab}>
          <span>Scheduled</span>
          <span className="text-xs">{counts?.scheduled ?? 0}</span>
        </NavLink>
        <NavLink to="/sent" className={tab}>
          <span>Sent</span>
          <span className="text-xs">{counts?.sent ?? 0}</span>
        </NavLink>
      </nav>

      <a
        href="/api/slack/connect"
        className="rounded-md border px-3 py-1.5 text-center text-sm text-gray-700 hover:bg-gray-100"
      >
        {slack?.connected ? `Slack connected (${slack.channel ?? 'ok'})` : 'Connect Slack'}
      </a>

      <button
        onClick={logout}
        className="mt-auto rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
      >
        Logout
      </button>
    </aside>
  );
}
