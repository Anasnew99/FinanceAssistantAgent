import { z } from 'zod';

export const AddTransactionSchema = z.object({
  owner_id: z.string().min(1),
  category_id: z.number().int().positive(),
  amount: z.number().nonnegative(),
  type: z.enum(['debit', 'credit']),
  date: z.string().datetime().optional()
});

export type AddTransactionInput = z.infer<typeof AddTransactionSchema>;

export const ListTransactionsSchema = z.object({
  owner_id: z.string().min(1),
  category_id: z.number().int().positive(),
  limit: z.number().int().positive().max(500).optional()
});

export type ListTransactionsInput = z.infer<typeof ListTransactionsSchema>;

export const UserIdSchema = z.object({ ownerid: z.string().min(1) });
export type UserIdInput = z.infer<typeof UserIdSchema>;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
};

