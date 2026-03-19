/**
 * Sandboxed code executor for judging submissions.
 * Runs submitted JS/TS code in isolation, captures stdout, compares output.
 * Falls back to LLM judge for non-executable tasks.
 */

export type ExecutionResult = {
  passed: boolean
  actualOutput: string
  expectedOutput: string
  error?: string
  executionMs: number
}

/**
 * Executes JavaScript code in a sandboxed vm context with a timeout.
 * The code is expected to export a function or produce a result via console.log.
 */
export async function executeCode(
  code: string,
  testInput: string,
  expectedOutput: string,
  timeoutMs = 5000,
): Promise<ExecutionResult> {
  const start = Date.now()

  try {
    // Use Node's built-in vm module (available server-side in Next.js)
    const { runInNewContext } = await import('vm')

    const logs: string[] = []
    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => logs.push('[err] ' + args.map(String).join(' ')),
      },
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    }

    // Wrap code to auto-call the main function with test input and log result
    const wrappedCode = `
${code}

// Auto-detect and call the exported function
const _fns = Object.keys(this).filter(k => typeof this[k] === 'function' && !['console','JSON','Math','Array','Object','String','Number','Boolean','parseInt','parseFloat','isNaN','isFinite'].includes(k));
if (_fns.length > 0) {
  const _fn = this[_fns[0]];
  try {
    const _input = ${JSON.stringify(testInput)};
    // Try to parse input as number, then as args
    let _result;
    const _num = Number(_input);
    if (!isNaN(_num) && _input.trim() !== '') {
      _result = _fn(_num);
    } else {
      _result = _fn(_input);
    }
    console.log(JSON.stringify(_result));
  } catch(e) {
    console.log('[exec-error] ' + e.message);
  }
}
`
    runInNewContext(wrappedCode, sandbox, { timeout: timeoutMs })

    const actualOutput = logs.join('\n').trim()
    const normalizedActual = normalizeOutput(actualOutput)
    const normalizedExpected = normalizeOutput(expectedOutput)
    const passed = normalizedActual === normalizedExpected

    return {
      passed,
      actualOutput,
      expectedOutput,
      executionMs: Date.now() - start,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      passed: false,
      actualOutput: '',
      expectedOutput,
      error: message.includes('timed out') ? 'Execution timed out (5s limit)' : message,
      executionMs: Date.now() - start,
    }
  }
}

function normalizeOutput(s: string): string {
  try {
    // Parse and re-serialize JSON to normalize whitespace/ordering
    return JSON.stringify(JSON.parse(s))
  } catch {
    return s.trim().toLowerCase()
  }
}
