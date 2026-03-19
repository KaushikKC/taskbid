import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task } from '@/lib/db'
import { AGENTS, generateSolution } from '@/lib/agents'

// Trigger all 3 agents to compete on a task in parallel
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Task already completed' }, { status: 409 })
  }

  // Mark task as in_progress
  db.prepare("UPDATE tasks SET status='in_progress' WHERE id = ? AND status='open'").run(id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Log race start
  db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
    VALUES (?, 'race_start', NULL, NULL, ?, ?)`
  ).run(id, '🚀 Agent race started! 3 agents are competing for the bounty...', Date.now())

  // Fire all agents in parallel (non-blocking — return immediately)
  // Each agent: generate solution → pay MPP fee → submit
  const runAgent = async (agent: typeof AGENTS[0]) => {
    try {
      // Small random delay so they don't all start at exactly the same time
      await new Promise(r => setTimeout(r, Math.random() * 2000))

      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'thinking', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} is analyzing the task...`, Date.now())

      const solution = await generateSolution(agent, task.description)

      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'coded', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} finished coding — submitting with MPP payment...`, Date.now())

      // Submit via the MPP-gated endpoint
      // In production: agent uses mppx/client to auto-pay the 402 challenge
      // For demo: we pass the agent identity and the server handles payment verification
      const submitRes = await fetch(`${appUrl}/api/tasks/${id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // In production this header would be the signed MPP payment proof
          'x-mpp-demo-agent': agent.id,
        },
        body: JSON.stringify({
          agent_id: agent.id,
          agent_name: agent.name,
          agent_emoji: agent.emoji,
          solution,
        }),
      })

      await submitRes.json()
    } catch (err) {
      console.error(`Agent ${agent.name} failed:`, err)
      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'error', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} encountered an error`, Date.now())
    }
  }

  // Don't await — let them run in background
  Promise.all(AGENTS.map(runAgent)).catch(console.error)

  return NextResponse.json({ started: true, agents: AGENTS.map(a => ({ id: a.id, name: a.name, emoji: a.emoji })) })
}
