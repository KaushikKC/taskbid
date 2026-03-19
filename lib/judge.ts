import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export type JudgeResult = {
  correct: boolean
  feedback: string
  score: number // 0-100
}

export async function judgeSubmission(
  taskDescription: string,
  testInput: string | null,
  expectedOutput: string | null,
  solution: string,
): Promise<JudgeResult> {
  const prompt = `You are a strict but fair code judge for a competitive programming contest.

TASK:
${taskDescription}

${testInput ? `TEST INPUT: ${testInput}` : ''}
${expectedOutput ? `EXPECTED OUTPUT: ${expectedOutput}` : ''}

SUBMITTED SOLUTION:
\`\`\`
${solution}
\`\`\`

Evaluate this solution:
1. Is the logic correct for the problem?
2. Would it produce the correct output for the test input?
3. Is it free of obvious bugs?

Respond in JSON exactly like this:
{
  "correct": true/false,
  "score": 0-100,
  "feedback": "brief 1-2 sentence explanation"
}`

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  try {
    const text = response.choices[0]?.message?.content ?? ''
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return {
      correct: Boolean(json.correct),
      feedback: json.feedback ?? 'No feedback provided',
      score: Number(json.score ?? 0),
    }
  } catch {
    return { correct: false, feedback: 'Judge evaluation failed', score: 0 }
  }
}
