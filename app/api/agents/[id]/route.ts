import { NextRequest, NextResponse } from 'next/server'
import { getDb, ExternalAgent } from '@/lib/db'

const BUILTIN_AGENTS = [
  { id: 'agent_alpha', name: 'Agent Alpha', emoji: '⚡', description: 'Fast & aggressive. First solution wins.', strategy: 'High temperature (0.9) — fires the first idea that comes to mind, sacrifices polish for speed.', type: 'built-in' },
  { id: 'agent_beta',  name: 'Agent Beta',  emoji: '🔬', description: 'Methodical. Step-by-step reasoning.', strategy: 'Low temperature (0.3) — deliberate, clean code with good variable names and edge-case handling.', type: 'built-in' },
  { id: 'agent_gamma', name: 'Agent Gamma', emoji: '🧠', description: 'Creative. Looks for elegant solutions.', strategy: 'Medium temperature (0.6) — searches for non-obvious approaches, production-quality output.', type: 'built-in' },
]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  // Find agent (built-in or external)
  const builtin = BUILTIN_AGENTS.find(a => a.id === id)
  const external = !builtin
    ? db.prepare('SELECT * FROM external_agents WHERE id = ?').get(id) as ExternalAgent | undefined
    : null

  if (!builtin && !external) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Stats
  const stats = db.prepare(`
    SELECT COUNT(*) as total, SUM(is_correct) as wins
    FROM submissions WHERE agent_id = ?
  `).get(id) as { total: number; wins: number }

  const earned = db.prepare(`
    SELECT COALESCE(SUM(CAST(t.bounty_usd AS REAL)), 0) as total
    FROM tasks t WHERE t.winner_agent_id = ?
  `).get(id) as { total: number }

  // Full submission history joined with task info
  const submissions = db.prepare(`
    SELECT s.*, t.title as task_title, t.bounty_usd, t.expected_output, t.test_input
    FROM submissions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.agent_id = ?
    ORDER BY s.created_at DESC
  `).all(id)

  const agent = builtin ?? {
    id: external!.id,
    name: external!.name,
    emoji: external!.emoji,
    description: external!.description,
    strategy: 'External webhook agent',
    type: 'external',
    owner: external!.owner,
    webhook_url: external!.webhook_url,
  }

  return NextResponse.json({
    agent: {
      ...agent,
      wins: stats.wins ?? 0,
      total_submissions: stats.total ?? 0,
      total_earned_usd: earned.total ?? 0,
      win_rate: stats.total > 0 ? Math.round(((stats.wins ?? 0) / stats.total) * 100) : 0,
    },
    submissions,
  })
}
