import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task, ExternalAgent, withDbRetry } from '@/lib/db'
import { AGENTS, generateSolution } from '@/lib/agents'
import { rateLimit, getClientIp } from '@/lib/ratelimit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Rate limit: 10 race starts per IP per minute
  const rl = rateLimit(`compete:${getClientIp(req.headers)}`, 10, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — try again later' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  const { id } = await params
  const db = getDb()

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Task already completed' }, { status: 409 })
  }

  withDbRetry((db) =>
    db.prepare("UPDATE tasks SET status='in_progress' WHERE id = ? AND status='open'").run(id)
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const externalAgents = db.prepare('SELECT * FROM external_agents').all() as ExternalAgent[]
  const totalAgents = AGENTS.length + externalAgents.length

  withDbRetry((db) =>
    db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
      VALUES (?, 'race_start', NULL, NULL, ?, ?)`)
      .run(id, `🚀 Race started! ${totalAgents} agent${totalAgents !== 1 ? 's' : ''} competing for $${task.bounty_usd}...`, Date.now())
  )

  const emitFeed = (type: string, agentName: string, agentEmoji: string, message: string) =>
    withDbRetry((db) =>
      db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, type, agentName, agentEmoji, message, Date.now())
    )

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // Built-in agents — 4-stage briefing: reading → planning → coding → submitting
  const runBuiltInAgent = async (agent: typeof AGENTS[0]) => {
    try {
      // Stagger start so agents don't all fire at exactly the same time
      await sleep(Math.random() * 1500)

      emitFeed('thinking', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} received the task — reading requirements...`)

      await sleep(400 + Math.random() * 600)

      emitFeed('planning', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} is planning the approach...`)

      // LLM call happens here (the slow part — typically 2–5s)
      const solution = await generateSolution(agent, task.description)

      emitFeed('coding', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} finished writing — paying $0.001 via MPP to submit...`)

      await fetch(`${appUrl}/api/tasks/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mpp-demo-agent': agent.id },
        body: JSON.stringify({ agent_id: agent.id, agent_name: agent.name, agent_emoji: agent.emoji, solution }),
      })
    } catch (err) {
      console.error(`Built-in agent ${agent.name} failed:`, err)
      emitFeed('error', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} encountered an error`)
    }
  }

  // External webhook agents — POST task to their URL, receive solution back
  const runExternalAgent = async (agent: ExternalAgent) => {
    try {
      emitFeed('thinking', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} (external) received the task — working on it...`)

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

      emitFeed('coding', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} returned a solution — paying $0.001 via MPP to submit...`)

      await fetch(`${appUrl}/api/tasks/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mpp-demo-agent': agent.id },
        body: JSON.stringify({ agent_id: agent.id, agent_name: agent.name, agent_emoji: agent.emoji, solution }),
      })

      // Update external agent stats
      withDbRetry((db) =>
        db.prepare('UPDATE external_agents SET total_submissions = total_submissions + 1 WHERE id = ?').run(agent.id)
      )
    } catch (err) {
      console.error(`External agent ${agent.name} failed:`, err)
      emitFeed('error', agent.name, agent.emoji,
        `${agent.emoji} ${agent.name} failed to respond in time`)
    }
  }

  Promise.all([
    ...AGENTS.map(runBuiltInAgent),
    ...externalAgents.map(runExternalAgent),
  ]).then(() => {
    // Auto-reset: if no agent won, release the task back to open after all agents finish
    const finalTask = withDbRetry((db) =>
      db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string } | undefined
    )
    if (finalTask?.status === 'in_progress') {
      withDbRetry((db) =>
        db.prepare("UPDATE tasks SET status='open' WHERE id = ? AND status='in_progress'").run(id)
      )
      withDbRetry((db) =>
        db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
          VALUES (?, 'error', NULL, NULL, ?, ?)`)
          .run(id, '⚠️ No agent solved the task — race reset to open. Try again!', Date.now())
      )
    }
  }).catch(console.error)

  // Safety net: hard timeout — reset task if still in_progress after 35s
  setTimeout(() => {
    try {
      const check = withDbRetry((db) =>
        db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string } | undefined
      )
      if (check?.status === 'in_progress') {
        withDbRetry((db) =>
          db.prepare("UPDATE tasks SET status='open' WHERE id = ? AND status='in_progress'").run(id)
        )
        withDbRetry((db) =>
          db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
            VALUES (?, 'error', NULL, NULL, ?, ?)`)
            .run(id, '⏱️ Race timed out — task reset to open.', Date.now())
        )
      }
    } catch (e) {
      console.error('Timeout reset failed:', e)
    }
  }, 35_000)

  return NextResponse.json({
    started: true,
    agents: [
      ...AGENTS.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, type: 'built-in' })),
      ...externalAgents.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, type: 'external' })),
    ],
  })
}
