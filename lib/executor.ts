export type ExecutionResult = {
  passed: boolean
  actualOutput: string
  expectedOutput: string
  error?: string
  executionMs: number
}

/**
 * Strip markdown code fences so the code can run in a vm context.
 * We rely on the agent prompt specifying plain JavaScript — if the LLM
 * still returns TypeScript, execution will fail and fall back to the LLM judge.
 */
function preprocessCode(raw: string): string {
  // Remove markdown fences: ```ts\n...\n``` or ```javascript\n...\n```
  const fenceMatch = raw.match(/^```[\w]*\n([\s\S]*?)```\s*$/m)
  if (fenceMatch) return fenceMatch[1].trim()
  // Single-line backtick wrap
  if (raw.startsWith('`') && raw.endsWith('`') && !raw.slice(1, -1).includes('`')) {
    return raw.slice(1, -1).trim()
  }
  return raw.trim()
}

/**
 * Extracts the first function name from submitted code.
 * Handles: function foo(, const foo =, const foo=(
 */
function extractFunctionName(code: string): string | null {
  const patterns = [
    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,        // function foo(
    /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/, // const foo = (
    /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?function/, // const foo = function
    /(?:let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/, // let foo = (
  ]
  for (const p of patterns) {
    const m = code.match(p)
    if (m) return m[1]
  }
  return null
}

export async function executeCode(
  code: string,
  testInput: string,
  expectedOutput: string,
  timeoutMs = 5000,
): Promise<ExecutionResult> {
  const start = Date.now()

  try {
    const { runInNewContext } = await import('vm')

    const processedCode = preprocessCode(code)
    const fnName = extractFunctionName(processedCode)
    if (!fnName) {
      return {
        passed: false,
        actualOutput: '',
        expectedOutput,
        error: 'Could not detect function name in submitted code',
        executionMs: Date.now() - start,
      }
    }

    const logs: string[] = []
    const sandbox = {
      console: { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
      JSON, Math, Array, Object, String, Number, Boolean,
      parseInt, parseFloat, isNaN, isFinite, Set, Map,
    }

    // Parse input: try number first, then string
    const numInput = Number(testInput)
    const parsedInput = !isNaN(numInput) && testInput.trim() !== ''
      ? numInput
      : testInput

    const wrappedCode = `
${processedCode}

try {
  const _result = ${fnName}(${JSON.stringify(parsedInput)});
  console.log(JSON.stringify(_result));
} catch (e) {
  console.log('[exec-error] ' + e.message);
}
`
    runInNewContext(wrappedCode, sandbox, { timeout: timeoutMs })

    const actualOutput = logs.join('\n').trim()
    const passed = normalizeOutput(actualOutput) === normalizeOutput(expectedOutput)

    return { passed, actualOutput, expectedOutput, executionMs: Date.now() - start }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      passed: false,
      actualOutput: '',
      expectedOutput,
      error: msg.includes('timed out') ? 'Timed out (5s limit)' : msg,
      executionMs: Date.now() - start,
    }
  }
}

function normalizeOutput(s: string): string {
  const trimmed = s.trim()
  try {
    const parsed = JSON.parse(trimmed)
    // String values: compare the raw string, not JSON-encoded
    // So '"racecar"' and 'racecar' both normalize to 'racecar'
    if (typeof parsed === 'string') return parsed.toLowerCase()
    // Boolean / number: use JSON for consistent form
    if (typeof parsed !== 'object') return String(parsed)
    // Arrays / objects: re-serialize for whitespace normalization
    return JSON.stringify(parsed)
  } catch {
    return trimmed.toLowerCase()
  }
}
