import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task, ExternalAgent } from '@/lib/db'
import { AGENTS, generateSolution } from '@/lib/agents'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Task already completed' }, { status: 409 })
  }

  db.prepare("UPDATE tasks SET status='in_progress' WHERE id = ? AND status='open'").run(id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const externalAgents = db.prepare('SELECT * FROM external_agents').all() as ExternalAgent[]
  const totalAgents = AGENTS.length + externalAgents.length

  db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
    VALUES (?, 'race_start', NULL, NULL, ?, ?)`
  ).run(id, `🚀 Race started! ${totalAgents} agent${totalAgents !== 1 ? 's' : ''} competing for $${task.bounty_usd}...`, Date.now())

  // Built-in agents
  const runBuiltInAgent = async (agent: typeof AGENTS[0]) => {
    try {
      await new Promise(r => setTimeout(r, Math.random() * 2000))

      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'thinking', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} is analyzing the task...`, Date.now())

      const solution = await generateSolution(agent, task.description)

      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'coded', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} finished coding — submitting with MPP payment...`, Date.now())

      await fetch(`${appUrl}/api/tasks/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mpp-demo-agent': agent.id },
        body: JSON.stringify({ agent_id: agent.id, agent_name: agent.name, agent_emoji: agent.emoji, solution }),
      })
    } catch (err) {
      console.error(`Built-in agent ${agent.name} failed:`, err)
      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'error', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} encountered an error`, Date.now())
    }
  }

  // External webhook agents — POST task to their URL, receive solution back
  const runExternalAgent = async (agent: ExternalAgent) => {
    try {
      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'thinking', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} (external) is working on the task...`, Date.now())

      const webhookRes = await fetch(agent.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-taskbid-api-key': agent.api_key },
        body: JSON.stringify({
          task_id: id,
          title: task.title,
          description: task.description,
          test_input: task.test_input,
          expected_output: task.expected_output,
          bounty_usd: task.bounty_usd,
        }),
        signal: AbortSignal.timeout(30000), // 30s max for external agents
      })

      if (!webhookRes.ok) throw new Error(`Webhook returned ${webhookRes.status}`)
      const { solution } = await webhookRes.json() as { solution: string }
      if (!solution) throw new Error('No solution in webhook response')

      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'coded', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} returned a solution — submitting with MPP payment...`, Date.now())

      await fetch(`${appUrl}/api/tasks/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mpp-demo-agent': agent.id },
        body: JSON.stringify({ agent_id: agent.id, agent_name: agent.name, agent_emoji: agent.emoji, solution }),
      })

      // Update external agent stats
      db.prepare('UPDATE external_agents SET total_submissions = total_submissions + 1 WHERE id = ?').run(agent.id)
    } catch (err) {
      console.error(`External agent ${agent.name} failed:`, err)
      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, 'error', ?, ?, ?, ?)`
      ).run(id, agent.name, agent.emoji, `${agent.emoji} ${agent.name} failed to respond in time`, Date.now())
    }
  }

  Promise.all([
    ...AGENTS.map(runBuiltInAgent),
    ...externalAgents.map(runExternalAgent),
  ]).catch(console.error)

  return NextResponse.json({
    started: true,
    agents: [
      ...AGENTS.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, type: 'built-in' })),
      ...externalAgents.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, type: 'external' })),
    ],
  })
}
