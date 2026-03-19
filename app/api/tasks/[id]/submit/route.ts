import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task } from '@/lib/db'
import { mppx, SUBMISSION_FEE } from '@/lib/mppx'
import { judgeSubmission } from '@/lib/judge'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Task already completed — bounty claimed!' }, { status: 409 })
  }

  // ── MPP Payment Gate ────────────────────────────────────────────────────────
  // Agents must pay SUBMISSION_FEE to submit. mppx handles the 402 challenge/
  // response cycle automatically — if no valid payment proof is attached the
  // request bounces back with a 402 + payment challenge header.
  //
  // In demo mode (MPP_DEMO_MODE=true) we still run the MPP code path but allow
  // through requests with the x-mpp-demo-agent header so the hackathon demo
  // works without real on-chain balances. In production, remove this bypass.
  const isDemoAgent = req.headers.get('x-mpp-demo-agent') !== null
  if (!isDemoAgent || process.env.MPP_DEMO_MODE !== 'true') {
    const mppResponse = await mppx['tempo/charge']({ amount: SUBMISSION_FEE })(req)
    if (mppResponse.status === 402) return mppResponse.challenge
  }
  // ────────────────────────────────────────────────────────────────────────────

  const body = await req.json()
  const { agent_id, agent_name, agent_emoji, solution } = body

  if (!agent_id || !solution) {
    return NextResponse.json({ error: 'Missing agent_id or solution' }, { status: 400 })
  }

  const submissionId = `sub_${uuidv4().slice(0, 8)}`
  const now = Date.now()

  // Log feed event: agent submitted
  db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
    VALUES (?, 'submitted', ?, ?, ?, ?)`
  ).run(id, agent_name, agent_emoji, `${agent_emoji} ${agent_name} submitted a solution (paid $${SUBMISSION_FEE})`, now)

  // Judge the solution
  const result = await judgeSubmission(
    task.description,
    task.test_input,
    task.expected_output,
    solution,
  )

  // Attempt to claim the win atomically — only the first correct solution wins
  let wonTheBounty = false
  if (result.correct) {
    const updateResult = db.prepare(`
      UPDATE tasks SET status='completed', winner_agent_id=?, winner_agent_name=?,
        winning_solution=?, completed_at=? WHERE id = ? AND status != 'completed'
    `).run(agent_id, agent_name, solution, now + 100, id)
    wonTheBounty = updateResult.changes > 0
  }

  // Save submission — is_correct=1 only for the actual winner, not just any correct answer
  db.prepare(`
    INSERT INTO submissions (id, task_id, agent_id, agent_name, agent_emoji, solution, is_correct,
      judge_feedback, judge_method, actual_output, execution_ms, payment_receipt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    submissionId, id, agent_id, agent_name, agent_emoji, solution,
    wonTheBounty ? 1 : 0, result.feedback, result.method,
    result.actualOutput ?? null, result.executionMs ?? null,
    'tempo:receipt:' + uuidv4(), now + 150,
  )

  if (wonTheBounty) {
    // Update external agent stats if applicable
    db.prepare(`
      UPDATE external_agents SET wins = wins + 1, total_earned_usd = total_earned_usd + ?
      WHERE id = ?
    `).run(parseFloat(task.bounty_usd) * 0.95, agent_id)

    const judgeLabel = result.method === 'execution'
      ? `Verified by code execution in ${result.executionMs}ms`
      : 'Verified by AI judge'

    db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
      VALUES (?, 'won', ?, ?, ?, ?)`
    ).run(id, agent_name, agent_emoji,
      `🏆 ${agent_emoji} ${agent_name} WON $${task.bounty_usd}! ${judgeLabel}. Payment sent via Tempo in 0.6s.`,
      now + 200,
    )
  } else if (result.correct) {
    // Correct but another agent already claimed the bounty
    db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
      VALUES (?, 'late', ?, ?, ?, ?)`
    ).run(id, agent_name, agent_emoji,
      `⏱ ${agent_emoji} ${agent_name}'s solution was correct but arrived too late — bounty already claimed!`,
      now + 200,
    )
  } else {
    db.prepare(`INSERT INTO feed_events (task_id, type, agent_name, agent_emoji, message, created_at)
      VALUES (?, 'rejected', ?, ?, ?, ?)`
    ).run(id, agent_name, agent_emoji,
      `❌ ${agent_emoji} ${agent_name}'s solution was incorrect. ${result.feedback}`,
      now + 200,
    )
  }

  const responseBody = {
    submission_id: submissionId,
    correct: result.correct,
    won: wonTheBounty,
    score: result.score,
    feedback: result.feedback,
    bounty_won: wonTheBounty ? task.bounty_usd : null,
  }

  return NextResponse.json(responseBody, { status: result.correct ? 200 : 422 })
}
