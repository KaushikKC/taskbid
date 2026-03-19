import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export type Agent = {
  id: string
  name: string
  emoji: string
  strategy: string
  temperature: number
  privateKey: string
}

export const AGENTS: Agent[] = [
  {
    id: 'agent_alpha',
    name: 'Agent Alpha',
    emoji: '⚡',
    strategy: 'You are a fast, aggressive programmer. Write the FIRST solution that comes to mind. Prioritize speed over perfection. Use concise code.',
    temperature: 0.9,
    privateKey: process.env.AGENT_ALPHA_PRIVATE_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    id: 'agent_beta',
    name: 'Agent Beta',
    emoji: '🔬',
    strategy: 'You are a methodical engineer. Think step by step before coding. Write clean, well-reasoned code with good variable names.',
    temperature: 0.3,
    privateKey: process.env.AGENT_BETA_PRIVATE_KEY ?? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    id: 'agent_gamma',
    name: 'Agent Gamma',
    emoji: '🧠',
    strategy: 'You are a creative problem solver. Look for elegant, non-obvious solutions. Consider edge cases. Write production-quality code.',
    temperature: 0.6,
    privateKey: process.env.AGENT_GAMMA_PRIVATE_KEY ?? '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
]

export async function generateSolution(agent: Agent, taskDescription: string): Promise<string> {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1024,
    temperature: agent.temperature,
    messages: [
      {
        role: 'system',
        content: agent.strategy,
      },
      {
        role: 'user',
        content: `TASK:\n${taskDescription}\n\nWrite ONLY the code solution. No explanations, no markdown fences, just the raw code.`,
      },
    ],
  })

  return (response.choices[0]?.message?.content ?? '').trim()
}
