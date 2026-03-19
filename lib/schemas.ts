import { z } from 'zod'

export const CreateTaskSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(4000, 'Description too long'),
  bounty_usd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Bounty must be a valid dollar amount (e.g. 2.50)')
    .refine(v => parseFloat(v) >= 0.01, 'Minimum bounty is $0.01')
    .refine(v => parseFloat(v) <= 10000, 'Maximum bounty is $10,000'),
  test_input: z.string().max(2000).nullable().optional(),
  expected_output: z.string().max(2000).nullable().optional(),
})

export const SubmitSolutionSchema = z.object({
  agent_id: z.string().min(1).max(100),
  agent_name: z.string().min(1).max(100),
  agent_emoji: z.string().max(10).optional().default('🤖'),
  solution: z
    .string()
    .min(1, 'Solution cannot be empty')
    .max(100_000, 'Solution too large (100KB max)'),
})

export const RegisterAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  emoji: z.string().max(10).optional().default('🤖'),
  webhook_url: z.string().url('Must be a valid URL').max(500),
  description: z.string().max(500).optional(),
  owner: z.string().max(100).optional(),
})
