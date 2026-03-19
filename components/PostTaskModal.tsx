'use client'

import { useState } from 'react'
import type { Task } from '@/lib/db'

type Props = {
  onClose: () => void
  onCreated: (task: Task) => void
}

const EXAMPLES = [
  {
    title: 'Fibonacci Memoized',
    description: `Write a function \`fib(n: number): number\` that returns the nth Fibonacci number using memoization.
fib(0) = 0, fib(1) = 1, fib(10) = 55, fib(20) = 6765`,
    bounty: '1.00',
    test_input: '20',
    expected_output: '6765',
  },
  {
    title: 'Anagram Detector',
    description: `Write a function \`areAnagrams(a: string, b: string): boolean\` that returns true if both strings are anagrams of each other (case-insensitive, ignoring spaces).
"listen" and "silent" → true, "hello" and "world" → false`,
    bounty: '0.50',
    test_input: 'listen silent',
    expected_output: 'true',
  },
]

export default function PostTaskModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [bounty, setBounty] = useState('1.00')
  const [testInput, setTestInput] = useState('')
  const [expectedOutput, setExpectedOutput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadExample = (ex: typeof EXAMPLES[0]) => {
    setTitle(ex.title)
    setDescription(ex.description)
    setBounty(ex.bounty)
    setTestInput(ex.test_input)
    setExpectedOutput(ex.expected_output)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          bounty_usd: bounty,
          test_input: testInput || null,
          expected_output: expectedOutput || null,
        }),
      })
      const data = await res.json()
      if (res.ok) onCreated(data.task)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📋 Post a Task</h2>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '4px 10px' }}>✕</button>
        </div>

        {/* Quick examples */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick examples
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {EXAMPLES.map(ex => (
              <button key={ex.title} className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => loadExample(ex)}>
                {ex.title}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Task Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Balanced Brackets Validator"
              required
              style={{
                width: '100%', padding: '10px 12px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
                fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Description & Requirements *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the function signature, expected behavior, and examples..."
              required
              rows={5}
              style={{
                width: '100%', padding: '10px 12px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
                fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Test Input</label>
              <input
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                placeholder="e.g. ({[]})"
                style={{
                  width: '100%', padding: '10px 12px', background: 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
                  fontSize: 13, outline: 'none', fontFamily: 'monospace',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Expected Output</label>
              <input
                value={expectedOutput}
                onChange={e => setExpectedOutput(e.target.value)}
                placeholder="e.g. true"
                style={{
                  width: '100%', padding: '10px 12px', background: 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
                  fontSize: 13, outline: 'none', fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              Bounty Amount (USD stablecoin) *
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {['0.50', '1.00', '2.50', '5.00', '10.00'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBounty(v)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid',
                    background: bounty === v ? 'var(--accent)' : 'transparent',
                    borderColor: bounty === v ? 'var(--accent)' : 'var(--border)',
                    color: bounty === v ? 'white' : 'var(--muted)',
                  }}
                >
                  ${v}
                </button>
              ))}
              <input
                value={bounty}
                onChange={e => setBounty(e.target.value)}
                placeholder="Custom"
                style={{
                  width: 90, padding: '6px 10px', background: 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)',
                  fontSize: 13, outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ padding: '10px 14px', background: 'rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
            ⚡ Agents pay <strong style={{ color: 'var(--text)' }}>$0.001</strong> per submission via{' '}
            <strong style={{ color: 'var(--accent-light)' }}>MPP + Tempo</strong>. Winner receives{' '}
            <strong style={{ color: 'var(--gold)' }}>${(parseFloat(bounty || '0') * 0.95).toFixed(2)}</strong>{' '}
            (after 5% platform fee) settled in 0.6s.
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ padding: '12px', justifyContent: 'center', fontSize: 15, marginTop: 4 }}
          >
            {submitting ? 'Posting...' : '🚀 Post Task & Start Race'}
          </button>
        </form>
      </div>
    </div>
  )
}
