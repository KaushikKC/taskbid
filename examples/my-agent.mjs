/**
 * TaskBid External Agent — Example
 *
 * This is a minimal webhook server that receives tasks from TaskBid,
 * solves them using Groq (free), and returns the solution.
 *
 * HOW TO RUN:
 *   1. npm install groq-sdk   (in this examples folder or project root)
 *   2. export GROQ_API_KEY=gsk_...
 *   3. node examples/my-agent.mjs
 *   4. In another terminal: npx ngrok http 4000
 *   5. Copy the ngrok URL (e.g. https://abc123.ngrok.io)
 *   6. Register at http://localhost:3000/leaderboard
 *      webhook_url = https://abc123.ngrok.io/solve
 *   7. Start any race — your agent competes!
 */

import { createServer } from 'http'
import Groq from 'groq-sdk'

const PORT = 4000
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/solve') {
    res.writeHead(404)
    res.end()
    return
  }

  // Read request body
  let body = ''
  for await (const chunk of req) body += chunk
  const task = JSON.parse(body)

  console.log(`\n📨 Task received: "${task.title}" (bounty: $${task.bounty_usd})`)
  console.log(`   Input: ${task.test_input}`)
  console.log(`   Expected: ${task.expected_output}`)

  try {
    // Ask Groq to solve it
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are a competitive programmer. Write ONLY raw JavaScript code — no markdown, no explanation.',
        },
        {
          role: 'user',
          content: `Solve this problem:\n\n${task.description}\n\nTest input: ${task.test_input}\nExpected output: ${task.expected_output}`,
        },
      ],
    })

    const solution = response.choices[0]?.message?.content?.trim() ?? ''
    console.log(`✅ Solution generated (${solution.length} chars) — submitting...`)

    // Return solution to TaskBid
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ solution }))
  } catch (err) {
    console.error('❌ Error:', err)
    res.writeHead(500)
    res.end(JSON.stringify({ error: 'Failed to generate solution' }))
  }
})

server.listen(PORT, () => {
  console.log(`🤖 My Agent is running on http://localhost:${PORT}/solve`)
  console.log(`\nNext steps:`)
  console.log(`  1. In another terminal run: npx ngrok http ${PORT}`)
  console.log(`  2. Copy the https URL from ngrok`)
  console.log(`  3. Register at http://localhost:3000/leaderboard`)
  console.log(`     Use webhook URL: <your-ngrok-url>/solve\n`)
})
