import type { Email } from '../types';
import StatusBadge from './StatusBadge';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export default function EmailRow({ email }: { email: Email }) {
  const time = email.status === 'sent' && email.sentAt ? email.sentAt : email.scheduledAt;
  return (
    <div className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 text-sm hover:bg-gray-50">
      <div className="w-56 shrink-0 truncate text-gray-700">To: {email.recipient}</div>
      <StatusBadge status={email.status} time={fmt(time)} />
      <div className="min-w-0 flex-1 truncate">
        <span className="font-medium">{email.subject}</span>
        <span className="text-gray-400"> - {email.body}</span>
      </div>
    </div>
  );
}