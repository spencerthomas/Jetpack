import { z } from 'zod';

export const MessageTypeSchema = z.enum([
  'task.created',
  'task.claimed',
  'task.assigned',
  'task.updated',
  'task.completed',
  'task.failed',
  'task.retry_scheduled',
  'agent.started',
  'agent.stopped',
  'agent.error',
  'file.lock',
  'file.unlock',
  'coordination.request',
  'coordination.response',
  'heartbeat',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  type: MessageTypeSchema,
  from: z.string(), // agent ID
  to: z.string().optional(), // agent ID or broadcast
  payload: z.record(z.unknown()),
  timestamp: z.date(),
  correlationId: z.string().optional(),
  // Acknowledgment fields
  ackRequired: z.boolean().optional(), // Whether ack is required
  ackedAt: z.date().optional(), // When it was acknowledged
  ackedBy: z.string().optional(), // Agent ID that acknowledged
});

export type Message = z.infer<typeof MessageSchema>;

// Message acknowledgment status
export interface MessageAckStatus {
  messageId: string;
  ackRequired: boolean;
  acked: boolean;
  ackedAt?: Date;
  ackedBy?: string;
}

export interface MessageBus {
  publish(message: Message): Promise<void>;
  subscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void;
  unsubscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void;
}
