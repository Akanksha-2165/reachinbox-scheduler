import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { parseEmails } from '../lib/parseEmails';

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ComposePage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startTime, setStartTime] = useState(toLocalInput(new Date()));
  const [delaySec, setDelaySec] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(50);

  const schedule = useMutation({
    mutationFn: () =>
      api<{ count: number }>('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          recipients,
          startTime: new Date(startTime).toISOString(),
          delayBetweenMs: Math.round(delaySec * 1000),
          hourlyLimit,
        }),
      }),
    onSuccess: (data) => {
      toast('success', `Scheduled ${data.count} email(s)`);
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['counts'] });
      navigate('/');
    },
    onError: (e: Error) => toast('error', e.message),
  });

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const addEmails = (list: string[]) =>
    setRecipients((prev) => Array.from(new Set([...prev, ...list])));

  const onUpload = async (file?: File) => {
    if (!file) return;
    const found = parseEmails(await file.text());
    if (found.length === 0) {
      toast('error', 'No valid emails found in this file');
      return;
    }
    addEmails(found);
    toast('success', `${found.length} email(s) detected`);
    if (fileRef.current) fileRef.current.value = '';
  };

  const commitTyped = () => {
    const found = parseEmails(typed);
    if (found.length) addEmails(found);
    else if (typed.trim()) toast('error', 'Invalid email address');
    setTyped('');
  };

  const submit = () => {
    if (!subject.trim()) return toast('error', 'Subject is required');
    if (!body.trim()) return toast('error', 'Body is required');
    if (recipients.length === 0) return toast('error', 'Add at least one recipient');
    schedule.mutate();
  };

  const input = 'w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-500';

  return (
    <div className="min-h-screen bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3">
        <button onClick={() => navigate('/')} className="text-lg">&larr;</button>
        <h1 className="font-medium">Compose New Email</h1>
        <button
          onClick={submit}
          disabled={schedule.isPending}
          className="ml-auto rounded-full border border-green-600 px-4 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
        >
          {schedule.isPending ? 'Scheduling...' : 'Schedule'}
        </button>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div>
          <label className="mb-1 block text-xs text-gray-500">From</label>
          <div className="text-sm">{user.email} <span className="text-gray-400">(sent via round-robin Ethereal senders)</span></div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-gray-500">To</label>
            <button onClick={() => fileRef.current?.click()} className="text-xs text-green-700 hover:underline">
              Upload List
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/plain,text/csv" className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0])} />
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-200 p-2">
            {recipients.slice(0, 5).map((r) => (
              <span key={r} className="flex items-center gap-1 rounded-full border border-green-500 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                {r}
                <button onClick={() => setRecipients((p) => p.filter((x) => x !== r))}>&times;</button>
              </span>
            ))}
            {recipients.length > 5 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">+{recipients.length - 5}</span>
            )}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTyped(); } }}
              onBlur={commitTyped}
              placeholder="recipient@example.com"
              className="min-w-[180px] flex-1 text-sm outline-none"
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">{recipients.length} email(s) detected</div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-500">Subject</label>
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Start time</label>
            <input type="datetime-local" className={input} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Delay between 2 emails (sec)</label>
            <input type="number" min={0} className={input} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Hourly Limit</label>
            <input type="number" min={1} className={input} value={hourlyLimit} onChange={(e) => setHourlyLimit(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-500">Body</label>
          <textarea rows={10} className={input} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your email..." />
        </div>
      </div>
    </div>
  );
}