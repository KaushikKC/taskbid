import { NextRequest, NextResponse } from 'next/server'
import { getDb, Task, Submission } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const submissions = db.prepare(
    'SELECT * FROM submissions WHERE task_id = ? ORDER BY created_at ASC'
  ).all(id) as Submission[]

  return NextResponse.json({ task, submissions })
}
