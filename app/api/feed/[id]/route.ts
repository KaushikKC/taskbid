import { NextRequest } from 'next/server'
import { getDb, FeedEvent } from '@/lib/db'

// Server-Sent Events stream for real-time race updates
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  let lastId = 0
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      req.signal.addEventListener('abort', () => {
        closed = true
        try { controller.close() } catch {}
      })

      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
        } catch {}
      }

      // Send existing events immediately
      const existing = db.prepare(
        'SELECT * FROM feed_events WHERE task_id = ? ORDER BY id ASC'
      ).all(id) as FeedEvent[]

      for (const event of existing) {
        send(event)
        lastId = event.id
      }

      // Poll for new events every 500ms
      const interval = setInterval(() => {
        if (closed) { clearInterval(interval); return }
        try {
          const newEvents = db.prepare(
            'SELECT * FROM feed_events WHERE task_id = ? AND id > ? ORDER BY id ASC'
          ).all(id, lastId) as FeedEvent[]

          for (const event of newEvents) {
            send(event)
            lastId = event.id
          }
        } catch {
          clearInterval(interval)
        }
      }, 500)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
