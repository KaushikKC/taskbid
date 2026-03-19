import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task, withDbRetry } from '@/lib/db'
import { CreateTaskSchema } from '@/lib/schemas'
import { rateLimit, getClientIp } from '@/lib/ratelimit'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  const db = getDb()
  const tasks = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM submissions WHERE task_id = t.id) as submission_count
    FROM tasks t
    ORDER BY t.created_at DESC
  `).all() as (Task & { submission_count: number })[]

  return NextResponse.json({ tasks })
}

export async function POST(req: NextRequest) {
  // Rate limit: 20 new tasks per IP per hour
  const rl = rateLimit(`post-task:${getClientIp(req.headers)}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — try again later' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const parsed = CreateTaskSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    )
  }

  const { title, description, bounty_usd, test_input, expected_output } = parsed.data

  const id = `task_${uuidv4().slice(0, 8)}`

  const task = withDbRetry((db) => {
    db.prepare(`
      INSERT INTO tasks (id, title, description, bounty_usd, status, created_at, test_input, expected_output)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(id, title, description, bounty_usd, Date.now(), test_input ?? null, expected_output ?? null)

    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
  })

  return NextResponse.json({ task }, { status: 201 })
}
