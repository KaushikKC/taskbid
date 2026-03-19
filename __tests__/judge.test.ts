import { describe, it, expect, vi } from 'vitest'

// Mock the LLM before importing judge so the judge never calls a real API in tests
vi.mock('../lib/llm', () => ({
  judgeChat: vi.fn().mockResolvedValue(
    '{"correct": true, "score": 90, "feedback": "Looks correct"}'
  ),
}))

import { judgeSubmission } from '../lib/judge'
import { judgeChat } from '../lib/llm'

describe('judgeSubmission — execution path', () => {
  it('judges a correct solution via code execution', async () => {
    const result = await judgeSubmission(
      'Write a function add(a,b)',
      '[3, 4]',
      '7',
      'function add(a, b) { return a + b; }',
    )
    expect(result.correct).toBe(true)
    expect(result.method).toBe('execution')
    expect(result.score).toBe(100)
    expect(judgeChat).not.toHaveBeenCalled()
  })

  it('judges an incorrect solution via code execution', async () => {
    const result = await judgeSubmission(
      'Write a function add(a,b)',
      '[3, 4]',
      '7',
      'function add(a, b) { return a * b; }', // wrong: returns 12
    )
    expect(result.correct).toBe(false)
    expect(result.method).toBe('execution')
    expect(result.score).toBe(0)
    expect(judgeChat).not.toHaveBeenCalled()
  })

  it('returns execution error (not LLM) for runtime crashes', async () => {
    const result = await judgeSubmission(
      'Write a function explode()',
      '1',
      '1',
      'function explode() { null.property; }',
    )
    expect(result.correct).toBe(false)
    expect(result.method).toBe('execution')
    expect(judgeChat).not.toHaveBeenCalled()
  })
})

describe('judgeSubmission — LLM fallback path', () => {
  it('falls back to LLM when no function name is detected', async () => {
    vi.mocked(judgeChat).mockClear()
    // Arrow function not matched by current regex patterns with implicit return
    const result = await judgeSubmission(
      'Describe what this does',
      null,
      null,
      'const x = 42', // no callable function
    )
    expect(result.method).toBe('llm')
    expect(judgeChat).toHaveBeenCalledOnce()
  })

  it('falls back to LLM when task has no test_input/expected_output', async () => {
    vi.mocked(judgeChat).mockClear()
    const result = await judgeSubmission(
      'Explain the concept of closures in JavaScript',
      null,
      null,
      'Closures are functions that capture variables from their enclosing scope.',
    )
    expect(result.method).toBe('llm')
    expect(judgeChat).toHaveBeenCalledOnce()
  })

  it('returns correct=false when LLM returns unparseable JSON', async () => {
    // The regex falls back to '{}', JSON.parse succeeds with empty object,
    // resulting in correct=false, feedback='No feedback'
    vi.mocked(judgeChat).mockResolvedValueOnce('not valid json at all')
    const result = await judgeSubmission(
      'Some task',
      null,
      null,
      'some code',
    )
    expect(result.correct).toBe(false)
    expect(result.method).toBe('llm')
  })
})

describe('judgeSubmission — schemas', () => {
  it('parses correct=true from LLM response', async () => {
    vi.mocked(judgeChat).mockResolvedValueOnce(
      '{"correct": true, "score": 95, "feedback": "Perfect solution"}'
    )
    const result = await judgeSubmission('task', null, null, 'code')
    expect(result.correct).toBe(true)
    expect(result.score).toBe(95)
    expect(result.feedback).toBe('Perfect solution')
  })

  it('parses correct=false from LLM response', async () => {
    vi.mocked(judgeChat).mockResolvedValueOnce(
      '{"correct": false, "score": 10, "feedback": "Missing edge cases"}'
    )
    const result = await judgeSubmission('task', null, null, 'code')
    expect(result.correct).toBe(false)
    expect(result.score).toBe(10)
  })
})
