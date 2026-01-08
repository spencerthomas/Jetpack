import { z } from 'zod';

export const MemoryTypeSchema = z.enum([
  'codebase_knowledge',
  'agent_learning',
  'pattern_recognition',
  'conversation_history',
  'decision_rationale',
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  type: MemoryTypeSchema,
  content: z.string(),
  embedding: z.array(z.number()).optional(), // For semantic search
  metadata: z.record(z.unknown()).optional(),
  importance: z.number().min(0).max(1).default(0.5),
  createdAt: z.date(),
  lastAccessed: z.date(),
  accessCount: z.number().default(0),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export interface MemoryStore {
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>): Promise<string>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  semanticSearch(embedding: number[], limit?: number): Promise<MemoryEntry[]>;
  compact(threshold: number): Promise<number>; // Remove low-importance entries
}
