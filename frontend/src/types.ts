export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface Email {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
}

export interface Counts {
  scheduled: number;
  sent: number;
}

export interface SlackStatus {
  connected: boolean;
  channel: string | null;
  teamName: string | null;
}