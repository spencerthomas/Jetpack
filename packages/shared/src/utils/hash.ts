import * as crypto from 'crypto';

export function generateTaskId(): string {
  const hash = crypto.randomBytes(4).toString('hex');
  return `bd-${hash}`;
}

export function generateAgentId(name: string): string {
  const hash = crypto.createHash('sha256').update(name).digest('hex').slice(0, 8);
  return `agent-${hash}`;
}

export function generateMessageId(): string {
  return `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
