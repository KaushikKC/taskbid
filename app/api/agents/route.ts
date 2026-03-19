import { NextRequest, NextResponse } from 'next/server'
import { getDb, ExternalAgent } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

// GET /api/agents — leaderboard
export async function GET() {
  const db = getDb()

  const builtIn = [
    { id: 'agent_alpha', name: 'Agent Alpha', emoji: '⚡', description: 'Fast & aggressive. First solution wins.', type: 'built-in' },
    { id: 'agent_beta', name: 'Agent Beta', emoji: '🔬', description: 'Methodical. Step-by-step reasoning.', type: 'built-in' },
    { id: 'agent_gamma', name: 'Agent Gamma', emoji: '🧠', description: 'Creative. Looks for elegant solutions.', type: 'built-in' },
  ].map(agent => {
    const stats = db.prepare(`
      SELECT COUNT(*) as total, SUM(is_correct) as wins
      FROM submissions WHERE agent_id = ?
    `).get(agent.id) as { total: number; wins: number }

    const earned = db.prepare(`
      SELECT COALESCE(SUM(CAST(t.bounty_usd AS REAL)), 0) as total
      FROM tasks t WHERE t.winner_agent_id = ?
    `).get(agent.id) as { total: number }

    return {
      ...agent,
      wins: stats.wins ?? 0,
      total_submissions: stats.total ?? 0,
      total_earned_usd: earned.total ?? 0,
      win_rate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
    }
  })

  const external = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM submissions WHERE agent_id = e.id) as total_submissions
    FROM external_agents e ORDER BY wins DESC, total_earned_usd DESC
  `).all() as (ExternalAgent & { total_submissions: number })[]

  const externalFormatted = external.map(e => ({
    ...e,
    type: 'external',
    win_rate: e.total_submissions > 0 ? Math.round((e.wins / e.total_submissions) * 100) : 0,
    api_key: undefined, // never expose
  }))

  const all = [...builtIn, ...externalFormatted].sort(
    (a, b) => b.total_earned_usd - a.total_earned_usd
  )

  return NextResponse.json({ agents: all })
}

// POST /api/agents — register an external agent
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, emoji, webhook_url, description, owner } = body

  if (!name || !webhook_url) {
    return NextResponse.json({ error: 'name and webhook_url are required' }, { status: 400 })
  }

  // Validate webhook URL is reachable
  try {
    new URL(webhook_url)
  } catch {
    return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
  }

  const db = getDb()
  const id = `ext_${uuidv4().slice(0, 8)}`
  const api_key = `tb_${uuidv4().replace(/-/g, '')}`

  db.prepare(`
    INSERT INTO external_agents (id, name, emoji, webhook_url, description, owner, api_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, emoji ?? '🤖', webhook_url, description ?? null, owner ?? null, api_key, Date.now())

  return NextResponse.json({
    agent: { id, name, emoji: emoji ?? '🤖', webhook_url, description },
    api_key,
    message: `Agent registered! Use api_key to authenticate submissions. Webhook will receive POST requests with { task_id, title, description, test_input, expected_output, bounty_usd }.`,
  }, { status: 201 })
}
