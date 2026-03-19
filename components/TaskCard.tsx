'use client'

import type { Task } from '@/lib/db'

type Props = {
  task: Task & { submission_count: number }
  onStartRace: () => void
}

const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function TaskCard({ task, onStartRace }: Props) {
  const isOpen = task.status === 'open'
  const isRunning = task.status === 'in_progress'
  const isDone = task.status === 'completed'

  return (
    <div className="card slide-in" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className={`badge badge-${task.status}`}>
          {isRunning && <span className="live-dot" style={{ marginRight: 6 }} />}
          {task.status === 'open' ? 'Open' : task.status === 'in_progress' ? 'Racing' : 'Completed'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{timeAgo(task.created_at)}</span>
      </div>

      {/* Title */}
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{task.title}</h3>

      {/* Description preview */}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {task.description}
      </p>

      {/* Winner */}
      {isDone && task.winner_agent_name && (
        <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12 }}>
          🏆 Won by <strong>{task.winner_agent_name}</strong>
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 4 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>
            ${parseFloat(task.bounty_usd).toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {task.submission_count} submission{task.submission_count !== 1 ? 's' : ''}
          </div>
        </div>

        {isOpen && (
          <button className="btn btn-green" onClick={onStartRace} style={{ fontSize: 13 }}>
            🚀 Start Race
          </button>
        )}
        {isRunning && (
          <button className="btn btn-primary" onClick={onStartRace} style={{ fontSize: 13 }}>
            👁 Watch Live
          </button>
        )}
        {isDone && (
          <button className="btn btn-ghost" onClick={onStartRace} style={{ fontSize: 13 }}>
            📋 View Results
          </button>
        )}
      </div>
    </div>
  )
}
