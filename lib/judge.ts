import { judgeChat } from './llm'
import { executeCode } from './executor'

export type JudgeResult = {
  correct: boolean
  feedback: string
  score: number
  method: 'execution' | 'llm'
  actualOutput?: string
  executionMs?: number
}

export async function judgeSubmission(
  taskDescription: string,
  testInput: string | null,
  expectedOutput: string | null,
  solution: string,
): Promise<JudgeResult> {
  // ── Phase 1: Real code execution (reliable, objective) ──────────────────────
  if (testInput && expectedOutput) {
    const exec = await executeCode(solution, testInput, expectedOutput)

    if (!exec.error) {
      return {
        correct: exec.passed,
        score: exec.passed ? 100 : 0,
        feedback: exec.passed
          ? `Code executed correctly. Output: ${exec.actualOutput} (${exec.executionMs}ms)`
          : `Wrong output. Got: "${exec.actualOutput}", expected: "${exec.expectedOutput}"`,
        method: 'execution',
        actualOutput: exec.actualOutput,
        executionMs: exec.executionMs,
      }
    }

    // Any execution error except "no function found" = wrong answer, no need for LLM
    if (exec.error !== 'Could not detect function name in submitted code') {
      return {
        correct: false,
        score: 0,
        feedback: `Execution error: ${exec.error}`,
        method: 'execution',
        executionMs: exec.executionMs,
      }
    }
  }

  // ── Phase 2: LLM judge fallback (for open-ended tasks or undetectable functions) ──
  const prompt = `You are a strict code judge. Evaluate this submission and respond in JSON only.

TASK: ${taskDescription}
${testInput ? `INPUT: ${testInput}` : ''}
${expectedOutput ? `EXPECTED OUTPUT: ${expectedOutput}` : ''}

SUBMISSION:
\`\`\`
${solution}
\`\`\`

JSON response (no other text):
{"correct": true/false, "score": 0-100, "feedback": "one sentence"}`

  try {
    const text = await judgeChat([{ role: 'user', content: prompt }])
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return {
      correct: Boolean(json.correct),
      feedback: String(json.feedback ?? 'No feedback'),
      score: Number(json.score ?? 0),
      method: 'llm',
    }
  } catch {
    return { correct: false, feedback: 'Judge unavailable', score: 0, method: 'llm' }
  }
}
