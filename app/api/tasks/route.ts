import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task } from '@/lib/db'
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
  const body = await req.json()
  const { title, description, bounty_usd, test_input, expected_output } = body

  if (!title || !description || !bounty_usd) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = getDb()
  const id = `task_${uuidv4().slice(0, 8)}`

  db.prepare(`
    INSERT INTO tasks (id, title, description, bounty_usd, status, created_at, test_input, expected_output)
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(id, title, description, bounty_usd, Date.now(), test_input ?? null, expected_output ?? null)

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task

  return NextResponse.json({ task }, { status: 201 })
}
