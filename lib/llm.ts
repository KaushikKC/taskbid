/**
 * Unified LLM abstraction — supports Groq, Anthropic, OpenAI, Gemini, xAI (Grok).
 *
 * Provider is selected automatically from whichever API key is set,
 * or explicitly via LLM_PROVIDER env var.
 *
 * Precedence (explicit override wins):
 *   LLM_PROVIDER=anthropic|openai|gemini|xai|groq
 *
 * Auto-detect order if LLM_PROVIDER is not set:
 *   ANTHROPIC_API_KEY → anthropic
 *   OPENAI_API_KEY    → openai
 *   GEMINI_API_KEY    → gemini
 *   XAI_API_KEY       → xai (Grok)
 *   GROQ_API_KEY      → groq  (default / free tier)
 *
 * Model overrides:
 *   AGENT_MODEL — model used by competing agents
 *   JUDGE_MODEL — model used by the judge (defaults to a smaller/faster model)
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ProviderConfig = {
  provider: string
  apiKey: string
  agentModel: string
  judgeModel: string
}

const DEFAULTS: Record<string, { agentModel: string; judgeModel: string }> = {
  groq:      { agentModel: 'llama-3.3-70b-versatile',      judgeModel: 'llama-3.1-8b-instant' },
  anthropic: { agentModel: 'claude-sonnet-4-6',             judgeModel: 'claude-haiku-4-5-20251001' },
  openai:    { agentModel: 'gpt-4o',                        judgeModel: 'gpt-4o-mini' },
  gemini:    { agentModel: 'gemini-2.0-flash',              judgeModel: 'gemini-2.0-flash' },
  xai:       { agentModel: 'grok-2-latest',                 judgeModel: 'grok-2-latest' },
}

function resolveProvider(): ProviderConfig {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase()

  const candidates: Array<{ name: string; key: string | undefined }> = [
    { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY },
    { name: 'openai',    key: process.env.OPENAI_API_KEY },
    { name: 'gemini',    key: process.env.GEMINI_API_KEY },
    { name: 'xai',       key: process.env.XAI_API_KEY },
    { name: 'groq',      key: process.env.GROQ_API_KEY },
  ]

  let chosen: { name: string; key: string } | null = null

  if (explicit) {
    const match = candidates.find(c => c.name === explicit)
    if (match?.key) chosen = { name: match.name, key: match.key }
    else if (match) throw new Error(`LLM_PROVIDER=${explicit} but ${explicit.toUpperCase()}_API_KEY is not set`)
    else throw new Error(`Unknown LLM_PROVIDER="${explicit}". Valid values: groq, anthropic, openai, gemini, xai`)
  } else {
    const auto = candidates.find(c => !!c.key)
    if (!auto) throw new Error('No LLM API key found. Set GROQ_API_KEY (free) or any of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY')
    chosen = { name: auto.name, key: auto.key! }
  }

  const defaults = DEFAULTS[chosen.name]
  return {
    provider: chosen.name,
    apiKey: chosen.key,
    agentModel: process.env.AGENT_MODEL ?? defaults.agentModel,
    judgeModel: process.env.JUDGE_MODEL ?? defaults.judgeModel,
  }
}

// Cache provider config — resolves once at startup
let _config: ProviderConfig | null = null
function getConfig(): ProviderConfig {
  if (!_config) _config = resolveProvider()
  return _config
}

/** Returns the active provider name — useful for displaying in UI */
export function getProviderInfo(): { provider: string; agentModel: string; judgeModel: string } {
  const c = getConfig()
  return { provider: c.provider, agentModel: c.agentModel, judgeModel: c.judgeModel }
}

// ── OpenAI-compatible call (Groq, OpenAI, Gemini, xAI all use this format) ──

const OPENAI_COMPAT_ENDPOINTS: Record<string, string> = {
  groq:   'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  xai:    'https://api.x.ai/v1/chat/completions',
}

async function callOpenAICompat(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  config: ProviderConfig,
): Promise<string> {
  const res = await fetch(OPENAI_COMPAT_ENDPOINTS[config.provider], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${config.provider} API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content?.trim() ?? ''
}

// ── Anthropic Messages API (different request/response format) ──

async function callAnthropic(
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  config: ProviderConfig,
): Promise<string> {
  const system = messages.find(m => m.role === 'system')?.content
  const nonSystem = messages.filter(m => m.role !== 'system')

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: nonSystem,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text?.trim() ?? ''
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function agentChat(
  messages: ChatMessage[],
  temperature = 0.7,
): Promise<string> {
  const config = getConfig()
  const model = config.agentModel
  if (config.provider === 'anthropic') return callAnthropic(messages, model, temperature, 1024, config)
  return callOpenAICompat(messages, model, temperature, 1024, config)
}

export async function judgeChat(
  messages: ChatMessage[],
): Promise<string> {
  const config = getConfig()
  const model = config.judgeModel
  if (config.provider === 'anthropic') return callAnthropic(messages, model, 0, 256, config)
  return callOpenAICompat(messages, model, 0, 256, config)
}
