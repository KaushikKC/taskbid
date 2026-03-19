import Database from 'better-sqlite3'
import path from 'path'

let db: Database.Database | null = null

function invalidateDb() {
  db = null
}

function isSqliteReadonlyMoved(err: unknown): boolean {
  // better-sqlite3 throws with shape: { code: 'SQLITE_...', message: '...' }
  const anyErr = err as { code?: unknown; message?: unknown } | null
  const code = anyErr?.code
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : String(err)

  return (
    code === 'SQLITE_READONLY_DBMOVED' ||
    msg.includes('readonly database') ||
    msg.includes('attempt to write a readonly') ||
    msg.includes('SQLITE_READONLY')
  )
}

function withDbRetry<T>(op: (db: Database.Database) => T, retries = 1): T {
  let lastErr: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const conn = getDb()
      return op(conn)
    } catch (err) {
      lastErr = err
      if (attempt < retries && isSqliteReadonlyMoved(err)) {
        invalidateDb()
        continue
      }
      throw err
    }
  }

  // Should be unreachable (loop either returns or throws)
  throw lastErr
}

function getDb(): Database.Database {
  // Reconnect if connection is dead (e.g. file deleted while server was running)
  if (db) {
    try {
      db.prepare('SELECT 1').get()
    } catch {
      invalidateDb()
    }
  }

  if (!db) {
    db = new Database(path.join(process.cwd(), 'taskbid.db'))
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        bounty_usd TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at INTEGER NOT NULL,
        winner_agent_id TEXT,
        winner_agent_name TEXT,
        winning_solution TEXT,
        completed_at INTEGER,
        test_input TEXT,
        expected_output TEXT
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        agent_emoji TEXT NOT NULL,
        solution TEXT NOT NULL,
        is_correct INTEGER DEFAULT 0,
        judge_feedback TEXT,
        judge_method TEXT DEFAULT 'llm',
        actual_output TEXT,
        execution_ms INTEGER,
        payment_receipt TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS feed_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        agent_name TEXT,
        agent_emoji TEXT,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS external_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '🤖',
        webhook_url TEXT NOT NULL,
        description TEXT,
        owner TEXT,
        api_key TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        total_submissions INTEGER DEFAULT 0,
        total_earned_usd REAL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `)

    // Seed with demo tasks if empty
    const count = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as { c: number }).c
    if (count === 0) {
      seedDemoTasks(db)
    }
  }
  return db!
}

function seedDemoTasks(db: Database.Database) {
  const tasks = [
    {
      id: 'task_demo_1',
      title: 'FizzBuzz with a Twist',
      description: `Write a function \`fizzBuzzTwist(n)\` that returns an array of strings from 1 to n where:
- Multiples of 3 → "Fizz"
- Multiples of 5 → "Buzz"
- Multiples of 15 → "FizzBuzz"
- Prime numbers → prefix with "PRIME:" (e.g., "PRIME:7", "PRIME:Fizz" for 3)
- Otherwise → the number as string

Example: fizzBuzzTwist(5) → ["1","PRIME:2","PRIME:Fizz","4","Buzz"]`,
      bounty_usd: '2.50',
      test_input: '5',
      expected_output: '["1","PRIME:2","PRIME:Fizz","4","Buzz"]',
    },
    {
      id: 'task_demo_2',
      title: 'Balanced Brackets Validator',
      description: `Write a function \`isBalanced(s: string): boolean\` that returns true if all brackets are properly balanced and nested.
Supports: \`()\`, \`[]\`, \`{}\`
Examples: \`"({[]})" → true\`, \`"([)]" → false\`, \`"{[}" → false\``,
      bounty_usd: '1.00',
      test_input: '({[]})',
      expected_output: 'true',
    },
    {
      id: 'task_demo_3',
      title: 'Longest Palindromic Substring',
      description: `Write a function \`longestPalindrome(s: string): string\` that finds the longest palindromic substring.
If multiple exist with the same length, return the first one.
Example: \`"babad" → "bab"\`, \`"cbbd" → "bb"\``,
      bounty_usd: '5.00',
      test_input: 'racecarxyz',
      expected_output: 'racecar',
    },
  ]

  const insert = db.prepare(`
    INSERT INTO tasks (id, title, description, bounty_usd, status, created_at, test_input, expected_output)
    VALUES (@id, @title, @description, @bounty_usd, 'open', @created_at, @test_input, @expected_output)
  `)

  for (const task of tasks) {
    insert.run({ ...task, created_at: Date.now() - Math.random() * 3600000 })
  }
}

export { getDb, withDbRetry, invalidateDb }
export type Task = {
  id: string
  title: string
  description: string
  bounty_usd: string
  status: 'open' | 'in_progress' | 'completed'
  created_at: number
  winner_agent_id: string | null
  winner_agent_name: string | null
  winning_solution: string | null
  completed_at: number | null
  test_input: string | null
  expected_output: string | null
}

export type Submission = {
  id: string
  task_id: string
  agent_id: string
  agent_name: string
  agent_emoji: string
  solution: string
  is_correct: number
  judge_feedback: string | null
  judge_method: 'execution' | 'llm'
  actual_output: string | null
  execution_ms: number | null
  payment_receipt: string | null
  created_at: number
}

export type FeedEvent = {
  id: number
  task_id: string
  type: string
  agent_name: string | null
  agent_emoji: string | null
  message: string
  created_at: number
}

export type ExternalAgent = {
  id: string
  name: string
  emoji: string
  webhook_url: string
  description: string | null
  owner: string | null
  api_key: string
  wins: number
  total_submissions: number
  total_earned_usd: number
  created_at: number
}
