import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Email, Counts } from '../types';

export function useEmails(tab: 'scheduled' | 'sent') {
  return useQuery({
    queryKey: ['emails', tab],
    queryFn: async () => {
      const statuses = tab === 'scheduled' ? ['scheduled', 'sending'] : ['sent', 'failed'];
      const lists = await Promise.all(
        statuses.map((s) => api<Email[]>(`/api/emails?status=${s}`))
      );
      return lists.flat();
    },
    refetchInterval: 5000,
  });
}

export function useCounts() {
  return useQuery({
    queryKey: ['counts'],
    queryFn: () => api<Counts>('/api/emails/counts'),
    refetchInterval: 5000,
  });
}