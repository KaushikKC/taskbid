import { describe, it, expect } from 'vitest'
import { executeCode } from '../lib/executor'

describe('executeCode', () => {
  // ── Basic execution ────────────────────────────────────────────────────────

  it('runs a correct function and returns passed=true', async () => {
    const code = `function add(a, b) { return a + b; }`
    const result = await executeCode(code, '[2, 3]', '5')
    expect(result.passed).toBe(true)
    expect(result.actualOutput).toBe('5')
    expect(result.error).toBeUndefined()
  })

  it('returns passed=false when output does not match', async () => {
    const code = `function add(a, b) { return a - b; }` // wrong impl
    const result = await executeCode(code, '[2, 3]', '5')
    expect(result.passed).toBe(false)
    expect(result.actualOutput).toBe('-1')
  })

  // ── Function name extraction ───────────────────────────────────────────────

  it('handles arrow function syntax', async () => {
    const code = `const fib = (n) => n <= 1 ? n : fib(n-1) + fib(n-2);`
    const result = await executeCode(code, '10', '55')
    expect(result.passed).toBe(true)
  })

  it('handles const fn = function() syntax', async () => {
    const code = `const double = function(n) { return n * 2; }`
    const result = await executeCode(code, '21', '42')
    expect(result.passed).toBe(true)
  })

  it('returns error when no function name can be detected', async () => {
    const code = `42 + 1` // no function
    const result = await executeCode(code, '1', '1')
    expect(result.error).toMatch(/Could not detect function name/)
    expect(result.passed).toBe(false)
  })

  // ── Multi-argument support ─────────────────────────────────────────────────

  it('spreads JSON array input as multiple arguments', async () => {
    const code = `function areAnagrams(a, b) {
      return a.toLowerCase().split('').sort().join('') === b.toLowerCase().split('').sort().join('');
    }`
    const result = await executeCode(code, '["listen", "silent"]', 'true')
    expect(result.passed).toBe(true)
  })

  it('passes a single string argument', async () => {
    const code = `function isBalanced(s) {
      const map = { ')': '(', ']': '[', '}': '{' };
      const stack = [];
      for (const c of s) {
        if ('([{'.includes(c)) stack.push(c);
        else if (map[c] !== stack.pop()) return false;
      }
      return stack.length === 0;
    }`
    const result = await executeCode(code, '"({[]})"', 'true')
    expect(result.passed).toBe(true)
  })

  // ── Output normalisation ───────────────────────────────────────────────────

  it('matches JSON-quoted string output against plain string expected', async () => {
    const code = `function longestPalindrome(s) {
      let best = '';
      for (let i = 0; i < s.length; i++) {
        for (let len = 0; len <= 1; len++) {
          let l = i, r = i + len;
          while (l >= 0 && r < s.length && s[l] === s[r]) { l--; r++; }
          const sub = s.slice(l + 1, r);
          if (sub.length > best.length) best = sub;
        }
      }
      return best;
    }`
    const result = await executeCode(code, '"racecarxyz"', 'racecar')
    expect(result.passed).toBe(true)
  })

  it('normalises boolean output', async () => {
    const code = `function alwaysTrue() { return true; }`
    // expected is the string "true" but JS returns boolean true (JSON.stringified to "true")
    const result = await executeCode(code, '[]', 'true')
    expect(result.passed).toBe(true)
  })

  // ── Markdown fence stripping ───────────────────────────────────────────────

  it('strips markdown code fences before execution', async () => {
    const code = '```javascript\nfunction square(n) { return n * n; }\n```'
    const result = await executeCode(code, '7', '49')
    expect(result.passed).toBe(true)
  })

  // ── Safety ────────────────────────────────────────────────────────────────

  it('enforces the execution timeout', async () => {
    const code = `function infinite() { while(true) {} }`
    const result = await executeCode(code, '1', '1', 200) // 200ms timeout
    expect(result.passed).toBe(false)
    expect(result.error).toMatch(/timed out/i)
  }, 3000)

  it('catches runtime errors inside the submitted code', async () => {
    const code = `function boom() { throw new Error('oops'); }`
    const result = await executeCode(code, '1', '1')
    // The exec wrapper catches the error and logs it; actual output will contain [exec-error]
    expect(result.passed).toBe(false)
  })
})
