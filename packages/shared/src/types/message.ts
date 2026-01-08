import { z } from 'zod';

export const MessageTypeSchema = z.enum([
  'task.created',
  'task.claimed',
  'task.updated',
  'task.completed',
  'task.failed',
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
});

export type Message = z.infer<typeof MessageSchema>;

export interface MessageBus {
  publish(message: Message): Promise<void>;
  subscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void;
  unsubscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void;
}
