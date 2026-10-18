import type { EmailStatus } from '../types';

const styles: Record<EmailStatus, string> = {
  scheduled: 'bg-orange-50 text-orange-600',
  sending: 'bg-blue-50 text-blue-600',
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-600',
};

export default function StatusBadge({ status, time }: { status: EmailStatus; time?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {time && <span>{time}</span>}
      <span className="capitalize">{status}</span>
    </span>
  );
}