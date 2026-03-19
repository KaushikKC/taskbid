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

const BUILTIN_COLORS = ['#f59e0b', '#60a5fa', '#a78bfa', '#34d399', '#f87171', '#fb923c']

type CompetingAgent = { id: string; name: string; emoji: string; strategy?: string; type: 'built-in' | 'external' }

const DEFAULT_AGENTS: CompetingAgent[] = [
  { id: 'agent_alpha', name: 'Agent Alpha', emoji: '⚡', strategy: 'Fast & aggressive', type: 'built-in' },
  { id: 'agent_beta',  name: 'Agent Beta',  emoji: '🔬', strategy: 'Methodical',        type: 'built-in' },
  { id: 'agent_gamma', name: 'Agent Gamma', emoji: '🧠', strategy: 'Creative',           type: 'built-in' },
]

export default function RaceModal({ task: initialTask, onClose }: Props) {
  const [detail, setDetail] = useState<TaskDetail>({ task: initialTask, submissions: [] })
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [started, setStarted] = useState(initialTask.status !== 'open')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [llmInfo, setLlmInfo] = useState<{ provider: string; agentModel: string } | null>(null)

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(d => { if (d.llm) setLlmInfo(d.llm) })
  }, [])
  const [activeTab, setActiveTab] = useState<'feed' | 'solutions'>('feed')
  const [competitors, setCompetitors] = useState<CompetingAgent[]>(DEFAULT_AGENTS)
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
    setStartError(null)
    setStarting(true)
    try {
      const res = await fetch(`/api/tasks/${initialTask.id}/compete`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setStartError(data.error ?? 'Failed to start race. Please try again.')
        setStarting(false)
        return
      }
      if (data.agents) setCompetitors(data.agents)
      setStarted(true)
    } catch {
      setStartError('Network error — please check your connection and try again.')
    } finally {
      setStarting(false)
    }
  }

  // If race already started, load the competitors from leaderboard
  useEffect(() => {
    if (initialTask.status !== 'open') {
      fetch('/api/agents').then(r => r.json()).then(data => {
        // Build competitor list from submissions — whoever submitted is competing
        // (we don't know exact list upfront for already-started races)
      })
    }
  }, [initialTask.status])

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

        {/* Agent status bar — dynamic, shows all competitors including external */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {competitors.map((agent, i) => {
            const sub = submissions.find(s => s.agent_id === agent.id || s.agent_name === agent.name)
            const color = BUILTIN_COLORS[i % BUILTIN_COLORS.length]
            return (
              <div key={agent.id} style={{ flex: '1 1 160px', padding: '10px 14px',
                background: 'var(--surface2)', borderRadius: 8, minWidth: 140,
                border: `1px solid ${sub?.is_correct ? color + '88' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{agent.emoji} {agent.name}</span>
                  {sub && (
                    <span style={{ fontSize: 11, fontWeight: 700,
                      color: sub.is_correct ? 'var(--gold)' : task.winner_agent_name ? 'var(--muted)' : 'var(--red)' }}>
                      {sub.is_correct ? '🏆 WON' : task.winner_agent_name ? '⏱ Too slow' : '✗ Wrong'}
                    </span>
                  )}
                  {!sub && started && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Working...</span>
                  )}
                  {!sub && !started && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Waiting</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {agent.strategy ?? (agent.type === 'external' ? '🔌 External agent' : '')}
                </div>
                {sub && (
                  <div style={{ fontSize: 10, color: color, marginTop: 4, fontFamily: 'monospace' }}>
                    {sub.judge_method === 'execution' ? `⚙ ${sub.execution_ms}ms` : '🤖 LLM'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* MPP payment info */}
        <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)',
          background: 'rgba(124,58,237,0.06)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span>⚡ <strong style={{ color: 'var(--accent-light)' }}>MPP Protocol</strong> — each submission requires a $0.001 Tempo stablecoin payment</span>
            <span>HTTP 402 challenge → auto-paid → receipt attached</span>
            <span>Winner paid in <strong style={{ color: 'var(--green)' }}>0.6s</strong></span>
            {llmInfo && (
              <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
                background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
                color: 'var(--accent-light)', fontFamily: 'monospace' }}>
                🤖 {llmInfo.provider} · {llmInfo.agentModel}
              </span>
            )}
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
              {events.map(event => {
                const styleMap: Record<string, { bg: string; border: string; color: string; weight: number }> = {
                  won:      { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  color: 'var(--gold)',         weight: 700 },
                  thinking: { bg: 'rgba(96,165,250,0.06)',  border: 'rgba(96,165,250,0.2)',  color: 'var(--text)',         weight: 400 },
                  planning: { bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.2)', color: 'var(--text)',         weight: 400 },
                  coding:   { bg: 'rgba(52,211,153,0.06)',  border: 'rgba(52,211,153,0.2)',  color: 'var(--text)',         weight: 400 },
                  error:    { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.2)',   color: '#f87171',             weight: 400 },
                }
                const s = styleMap[event.type] ?? { bg: 'var(--surface2)', border: 'var(--border)', color: 'var(--text)', weight: 400 }
                return (
                  <div key={event.id} className="slide-in" style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                    background: s.bg, border: `1px solid ${s.border}`,
                    color: s.color, fontWeight: s.weight,
                  }}>
                    <span style={{ color: 'var(--muted)', fontSize: 11, marginRight: 8 }}>
                      {new Date(event.created_at).toLocaleTimeString()}
                    </span>
                    {event.message}
                  </div>
                )
              })}
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
              {submissions.map(sub => {
                const isWinner = sub.is_correct === 1
                const wasCorrectButLate = !isWinner && sub.judge_method === 'execution' && sub.actual_output === task.expected_output
                return (
                <div key={sub.id} style={{
                  borderRadius: 10, overflow: 'hidden',
                  border: `1px solid ${isWinner ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
                }}>
                  {/* Header row */}
                  <div style={{ padding: '10px 14px', background: 'var(--surface2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{sub.agent_emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 13,
                        color: BUILTIN_COLORS[competitors.findIndex(c => c.name === sub.agent_name) % BUILTIN_COLORS.length] ?? 'var(--text)' }}>
                        {sub.agent_name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {new Date(sub.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Judge method badge */}
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace',
                        background: sub.judge_method === 'execution' ? 'rgba(16,185,129,0.1)' : 'rgba(96,165,250,0.1)',
                        color: sub.judge_method === 'execution' ? 'var(--green)' : '#60a5fa',
                        border: `1px solid ${sub.judge_method === 'execution' ? 'rgba(16,185,129,0.3)' : 'rgba(96,165,250,0.3)'}` }}>
                        {sub.judge_method === 'execution' ? `⚙ executed ${sub.execution_ms}ms` : '🤖 LLM judge'}
                      </span>
                      {sub.payment_receipt && (
                        <span style={{ fontSize: 10, color: 'var(--accent-light)', fontFamily: 'monospace',
                          padding: '2px 6px', background: 'rgba(124,58,237,0.1)', borderRadius: 4,
                          border: '1px solid rgba(124,58,237,0.3)' }}>
                          MPP ✓
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700,
                        color: isWinner ? 'var(--gold)' : wasCorrectButLate ? 'var(--muted)' : 'var(--red)' }}>
                        {isWinner ? '🏆 WINNER' : wasCorrectButLate ? '⏱ Too slow' : '✗ Wrong'}
                      </span>
                    </div>
                  </div>

                  {/* Code */}
                  <pre style={{ margin: 0, padding: '14px', background: '#0d0d14',
                    fontSize: 12, lineHeight: 1.6, overflowX: 'auto', maxHeight: 220,
                    fontFamily: 'JetBrains Mono, Fira Code, monospace', color: '#c9d1d9' }}>
                    {sub.solution}
                  </pre>

                  {/* Execution result row */}
                  {sub.judge_method === 'execution' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
                      borderTop: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 14px', borderRight: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Actual output
                        </div>
                        <code style={{ fontSize: 12, color: isWinner ? 'var(--green)' : 'var(--red)',
                          fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {sub.actual_output || '(empty)'}
                        </code>
                      </div>
                      <div style={{ padding: '8px 14px' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Expected output
                        </div>
                        <code style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {task.expected_output || '—'}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* LLM feedback row */}
                  {sub.judge_method === 'llm' && sub.judge_feedback && (
                    <div style={{ padding: '8px 14px', background: 'var(--surface2)',
                      fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
                      🤖 {sub.judge_feedback}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer action */}
        {!started && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            {startError && (
              <div style={{
                marginBottom: 12, padding: '8px 14px', borderRadius: 8, fontSize: 13,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
              }}>
                {startError}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
