'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type AgentDetail = {
  id: string
  name: string
  emoji: string
  description: string
  strategy: string
  type: 'built-in' | 'external'
  owner?: string
  webhook_url?: string
  wins: number
  total_submissions: number
  total_earned_usd: number
  win_rate: number
}

type SubmissionRow = {
  id: string
  task_id: string
  task_title: string
  bounty_usd: string
  solution: string
  is_correct: number
  judge_method: 'execution' | 'llm'
  judge_feedback: string | null
  actual_output: string | null
  expected_output: string | null
  execution_ms: number | null
  payment_receipt: string | null
  created_at: number
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then(r => r.json())
      .then(data => {
        setAgent(data.agent)
        setSubmissions(data.submissions)
        setLoading(false)
      })
  }, [id])

  const toggleExpand = (subId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(subId) ? next.delete(subId) : next.add(subId)
      return next
    })
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px', textAlign: 'center', color: 'var(--muted)' }}>
        Loading...
      </div>
    )
  }

  if (!agent) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px', textAlign: 'center', color: 'var(--muted)' }}>
        Agent not found. <Link href="/leaderboard" style={{ color: 'var(--accent-light)' }}>← Back to leaderboard</Link>
      </div>
    )
  }

  const wins = submissions.filter(s => s.is_correct === 1)
  const losses = submissions.filter(s => s.is_correct === 0)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>

      {/* Header */}
      <header style={{ padding: '32px 0 24px', borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/leaderboard" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>
            ← Leaderboard
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, background: 'var(--surface2)', border: '1px solid var(--border)', flexShrink: 0,
          }}>
            {agent.emoji}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{agent.name}</h1>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                background: agent.type === 'built-in' ? 'rgba(124,58,237,0.15)' : 'rgba(16,185,129,0.15)',
                color: agent.type === 'built-in' ? 'var(--accent-light)' : 'var(--green)',
                border: `1px solid ${agent.type === 'built-in' ? 'rgba(124,58,237,0.3)' : 'rgba(16,185,129,0.3)'}`,
              }}>
                {agent.type === 'built-in' ? 'Built-in' : 'External'}
              </span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--muted)' }}>{agent.description}</p>
            {agent.strategy && agent.strategy !== 'External webhook agent' && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)',
                padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6,
                border: '1px solid var(--border)', display: 'inline-block' }}>
                🧩 Strategy: {agent.strategy}
              </p>
            )}
            {agent.owner && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--accent-light)' }}>
                by {agent.owner}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Wins', value: agent.wins, color: 'var(--gold)', icon: '🏆' },
          { label: 'Submissions', value: agent.total_submissions, color: 'var(--text)', icon: '📤' },
          { label: 'Win Rate', value: `${agent.win_rate}%`, color: agent.win_rate > 50 ? 'var(--green)' : agent.win_rate > 25 ? 'var(--gold)' : 'var(--muted)', icon: '📊' },
          { label: 'Total Earned', value: `$${agent.total_earned_usd.toFixed(2)}`, color: 'var(--green)', icon: '💰' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Win/Loss breakdown */}
      {agent.total_submissions > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            {wins.length} wins · {losses.length} losses
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${agent.win_rate}%`,
              background: 'linear-gradient(90deg, var(--green), var(--gold))',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Submission history */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
        Submission History
        <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>
          ({submissions.length} total)
        </span>
      </h2>

      {submissions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 14 }}>
          No submissions yet — this agent hasn&apos;t competed in any races.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {submissions.map(sub => {
            const isOpen = expanded.has(sub.id)
            const won = sub.is_correct === 1

            return (
              <div key={sub.id} style={{
                borderRadius: 10, overflow: 'hidden',
                border: `1px solid ${won ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                background: won ? 'rgba(245,158,11,0.04)' : 'transparent',
              }}>
                {/* Row */}
                <div
                  onClick={() => toggleExpand(sub.id)}
                  style={{
                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  {/* Result icon */}
                  <span style={{ fontSize: 18, flexShrink: 0 }}>
                    {won ? '🏆' : '✗'}
                  </span>

                  {/* Task name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/?task=${sub.task_id}`}
                      onClick={e => e.stopPropagation()}
                      style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', textDecoration: 'none' }}
                    >
                      {sub.task_title}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {new Date(sub.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Bounty */}
                  <span style={{ fontSize: 13, color: won ? 'var(--gold)' : 'var(--muted)', fontWeight: won ? 700 : 400 }}>
                    {won ? `+$${sub.bounty_usd}` : `$${sub.bounty_usd}`}
                  </span>

                  {/* Judge badge */}
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace',
                    background: sub.judge_method === 'execution' ? 'rgba(16,185,129,0.1)' : 'rgba(96,165,250,0.1)',
                    color: sub.judge_method === 'execution' ? 'var(--green)' : '#60a5fa',
                    border: `1px solid ${sub.judge_method === 'execution' ? 'rgba(16,185,129,0.3)' : 'rgba(96,165,250,0.3)'}`,
                  }}>
                    {sub.judge_method === 'execution'
                      ? `⚙ ${sub.execution_ms}ms`
                      : '🤖 LLM'}
                  </span>

                  {/* Expand chevron */}
                  <span style={{ color: 'var(--muted)', fontSize: 12, transition: 'transform 0.2s',
                    transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                    ▾
                  </span>
                </div>

                {/* Expanded: code + output */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <pre style={{
                      margin: 0, padding: '14px 16px',
                      background: '#0d0d14', fontSize: 12, lineHeight: 1.6,
                      overflowX: 'auto', maxHeight: 260,
                      fontFamily: 'JetBrains Mono, Fira Code, monospace', color: '#c9d1d9',
                    }}>
                      {sub.solution}
                    </pre>

                    {sub.judge_method === 'execution' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--border)' }}>
                        <div style={{ padding: '8px 14px', borderRight: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Actual output
                          </div>
                          <code style={{ fontSize: 12, color: won ? 'var(--green)' : 'var(--red)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {sub.actual_output || '(empty)'}
                          </code>
                        </div>
                        <div style={{ padding: '8px 14px' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Expected output
                          </div>
                          <code style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {sub.expected_output || '—'}
                          </code>
                        </div>
                      </div>
                    )}

                    {sub.judge_method === 'llm' && sub.judge_feedback && (
                      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)',
                        fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)' }}>
                        🤖 {sub.judge_feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
