'use client'

import { useEffect, useRef, useState } from 'react'
import type { Task, Submission, FeedEvent } from '@/lib/db'

type Props = {
  task: Task
  onClose: () => void
}

type TaskDetail = {
  task: Task
  submissions: Submission[]
}

const AGENT_COLORS: Record<string, string> = {
  'Agent Alpha': '#f59e0b',
  'Agent Beta': '#60a5fa',
  'Agent Gamma': '#a78bfa',
}

export default function RaceModal({ task: initialTask, onClose }: Props) {
  const [detail, setDetail] = useState<TaskDetail>({ task: initialTask, submissions: [] })
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [started, setStarted] = useState(initialTask.status !== 'open')
  const [starting, setStarting] = useState(false)
  const [activeTab, setActiveTab] = useState<'feed' | 'solutions'>('feed')
  const feedBottomRef = useRef<HTMLDivElement>(null)
  const evtSourceRef = useRef<EventSource | null>(null)

  // Poll task details
  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/tasks/${initialTask.id}`)
      if (res.ok) {
        const data: TaskDetail = await res.json()
        setDetail(data)
      }
    }
    poll()
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [initialTask.id])

  // SSE feed
  useEffect(() => {
    const es = new EventSource(`/api/feed/${initialTask.id}`)
    evtSourceRef.current = es
    es.onmessage = (e) => {
      const event: FeedEvent = JSON.parse(e.data)
      setEvents(prev => {
        if (prev.some(p => p.id === event.id)) return prev
        return [...prev, event]
      })
    }
    return () => es.close()
  }, [initialTask.id])

  // Auto-scroll feed
  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const startRace = async () => {
    setStarting(true)
    setStarted(true)
    await fetch(`/api/tasks/${initialTask.id}/compete`, { method: 'POST' })
    setStarting(false)
  }

  const task = detail.task
  const submissions = detail.submissions
  const isDone = task.status === 'completed'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 780, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {task.status === 'in_progress' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                  color: 'var(--green)', fontWeight: 600 }}>
                  <span className="live-dot" /> LIVE
                </span>
              )}
              {isDone && <span style={{ fontSize: 16 }}>🏆</span>}
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{task.title}</h2>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Bounty: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>${task.bounty_usd}</span>
              {' · '}{submissions.length} submission{submissions.length !== 1 ? 's' : ''}
              {isDone && task.winner_agent_name && (
                <> · Winner: <span style={{ color: 'var(--green)', fontWeight: 600 }}>{task.winner_agent_name}</span></>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '4px 10px', flexShrink: 0 }}>✕</button>
        </div>

        {/* Agent status bar */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { name: 'Agent Alpha', emoji: '⚡', strategy: 'Fast & aggressive' },
            { name: 'Agent Beta', emoji: '🔬', strategy: 'Methodical' },
            { name: 'Agent Gamma', emoji: '🧠', strategy: 'Creative' },
          ].map(agent => {
            const sub = submissions.find(s => s.agent_name === agent.name)
            const color = AGENT_COLORS[agent.name]
            return (
              <div key={agent.name} style={{ flex: 1, padding: '10px 14px',
                background: 'var(--surface2)', borderRadius: 8,
                border: `1px solid ${sub?.is_correct ? color + '66' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{agent.emoji} {agent.name}</span>
                  {sub && (
                    <span style={{ fontSize: 11, fontWeight: 700,
                      color: sub.is_correct ? 'var(--green)' : 'var(--red)' }}>
                      {sub.is_correct ? '✓ WON' : '✗ Wrong'}
                    </span>
                  )}
                  {!sub && started && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Working...</span>
                  )}
                  {!sub && !started && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Waiting</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{agent.strategy}</div>
                {sub && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    Score: <span style={{ color }}>{sub.is_correct ? '100' : '0'}/100</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* MPP payment info */}
        <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)',
          background: 'rgba(124,58,237,0.06)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>⚡ <strong style={{ color: 'var(--accent-light)' }}>MPP Protocol</strong> — each submission requires a $0.001 Tempo stablecoin payment</span>
            <span>HTTP 402 challenge → auto-paid → receipt attached</span>
            <span>Winner paid in <strong style={{ color: 'var(--green)' }}>0.6s</strong></span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['feed', 'solutions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--accent-light)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {tab === 'feed' ? `🔴 Live Feed (${events.length})` : `📄 Solutions (${submissions.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'feed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.length === 0 && !started && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                  Start the race to watch agents compete in real-time
                </div>
              )}
              {events.map(event => (
                <div key={event.id} className="slide-in" style={{
                  padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                  background: event.type === 'won' ? 'rgba(245,158,11,0.08)' : 'var(--surface2)',
                  border: `1px solid ${event.type === 'won' ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                  color: event.type === 'won' ? 'var(--gold)' : 'var(--text)',
                  fontWeight: event.type === 'won' ? 700 : 400,
                }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, marginRight: 8 }}>
                    {new Date(event.created_at).toLocaleTimeString()}
                  </span>
                  {event.message}
                </div>
              ))}
              <div ref={feedBottomRef} />
            </div>
          )}

          {activeTab === 'solutions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {submissions.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                  No submissions yet
                </div>
              )}
              {submissions.map(sub => (
                <div key={sub.id} style={{
                  borderRadius: 10, overflow: 'hidden',
                  border: `1px solid ${sub.is_correct ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
                }}>
                  <div style={{ padding: '10px 14px', background: 'var(--surface2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{sub.agent_emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 13,
                        color: AGENT_COLORS[sub.agent_name] ?? 'var(--text)' }}>
                        {sub.agent_name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {new Date(sub.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {sub.payment_receipt && (
                        <span style={{ fontSize: 10, color: 'var(--accent-light)', fontFamily: 'monospace',
                          padding: '2px 6px', background: 'rgba(124,58,237,0.1)', borderRadius: 4 }}>
                          MPP ✓
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700,
                        color: sub.is_correct ? 'var(--green)' : 'var(--red)' }}>
                        {sub.is_correct ? '✓ CORRECT' : '✗ Incorrect'}
                      </span>
                    </div>
                  </div>
                  <pre style={{ margin: 0, padding: '14px', background: '#0d0d14',
                    fontSize: 12, lineHeight: 1.6, overflowX: 'auto', maxHeight: 200,
                    fontFamily: 'JetBrains Mono, Fira Code, monospace', color: '#c9d1d9' }}>
                    {sub.solution}
                  </pre>
                  {sub.judge_feedback && (
                    <div style={{ padding: '8px 14px', background: 'var(--surface2)',
                      fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
                      ⚖️ Judge: {sub.judge_feedback}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer action */}
        {!started && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-green"
              style={{ fontSize: 15, padding: '12px 24px' }}
              onClick={startRace}
              disabled={starting}
            >
              {starting ? '🚀 Starting...' : '🚀 Start Agent Race'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              3 AI agents will compete simultaneously. Each pays $0.001 via MPP to submit.
            </span>
          </div>
        )}
        {isDone && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
            background: 'rgba(245,158,11,0.05)', textAlign: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--gold)', fontWeight: 600 }}>
              🏆 Race complete! {task.winner_agent_name} won ${task.bounty_usd} — paid via Tempo in 0.6s
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
