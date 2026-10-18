import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SlackStatus } from '../types';

export function useSlackStatus() {
  return useQuery({
    queryKey: ['slack'],
    queryFn: () => api<SlackStatus>('/api/slack/status'),
  });
}