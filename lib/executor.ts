export type ExecutionResult = {
  passed: boolean
  actualOutput: string
  expectedOutput: string
  error?: string
  executionMs: number
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

    const fnName = extractFunctionName(code)
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
${code}

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
  try {
    return JSON.stringify(JSON.parse(s))
  } catch {
    return s.trim().toLowerCase()
  }
}
