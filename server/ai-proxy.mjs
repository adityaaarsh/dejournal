/**
 * DeJournal optional AI proxy.
 *
 * Keeps the Anthropic API key on the server: the browser app only ever talks
 * to this process (via /api/ai), never to the provider directly.
 *
 *   ANTHROPIC_API_KEY=... npm run ai-server        (or put it in .env)
 *
 * Env:
 *   ANTHROPIC_API_KEY  required to enable AI
 *   AI_MODEL           default "claude-opus-5-5"
 *   AI_EFFORT          low | medium | high (default "medium")
 *   AI_PORT            default 8787
 *
 * Endpoints:
 *   GET  /api/ai/health  -> { available, model, reason? }
 *   POST /api/ai         { task, input } -> { text }
 *
 * Privacy: request bodies are never logged. Only the task name, status and
 * duration are printed.
 *
 * Requires the official SDK: `npm install @anthropic-ai/sdk`. If it is not
 * installed, /health reports unavailable with a reason.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/* ---------- .env loader (no dependencies) ---------- */
function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}
loadDotEnv()

const PORT = Number(process.env.AI_PORT || 8787)
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5'
const EFFORT = ['low', 'medium', 'high'].includes(process.env.AI_EFFORT) ? process.env.AI_EFFORT : 'medium'
const MAX_BODY = 32 * 1024
const TASKS = new Set(['month-summary', 'plan-tomorrow', 'day-summary'])

/* ---------- Prompts ---------- */
const BASE_RULES = [
  'You are the optional reflection assistant inside DeJournal, a private personal journal and daily tracker.',
  'You receive a small JSON summary of the user\'s own records. Use ONLY that data.',
  'Never invent events, numbers, feelings or memories that are not in the data. If something is missing, say it was not recorded rather than treating it as zero.',
  'Do not diagnose, give medical or psychological assessments, or infer health conditions. Ratings are the user\'s own subjective scores.',
  'Be warm, concise and practical. Write in second person ("you"). Use plain text with short paragraphs or "- " bullet lists; no headings, no markdown tables.',
].join('\n')

const TASK_PROMPTS = {
  'month-summary':
    'Write a short monthly reflection (120–200 words): what the month looked like, notable highlights, patterns in ratings, tasks, study and spending, and 2–3 gentle, concrete suggestions for next month. Mention when the month is still in progress.',
  'plan-tomorrow':
    'Suggest a realistic, light plan for tomorrow (max 5 bullet points) based on open tasks, study goal progress and recent ratings. Prefer fewer, achievable items over many.',
  'day-summary': 'Summarize this day in 2–4 sentences based only on the records provided, then add one optional suggestion for tomorrow.',
}

/* ---------- Anthropic client (lazy) ---------- */
let clientPromise = null
async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY is not set on the server.' }
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then((mod) => ({ Anthropic: mod.default, client: new mod.default({ timeout: 60_000, maxRetries: 1 }) }))
      .catch(() => ({ error: 'The @anthropic-ai/sdk package is not installed. Run: npm install @anthropic-ai/sdk' }))
  }
  return clientPromise
}

async function runTask(task, input) {
  const c = await getClient()
  if (c.error) {
    const err = new Error(c.error)
    err.status = 503
    throw err
  }
  const { Anthropic, client } = c
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: EFFORT },
      // Server-side refusal fallback: routes a declined request to a suitable model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${BASE_RULES}\n\nTask: ${TASK_PROMPTS[task]}`,
      messages: [{ role: 'user', content: `Here is the data (JSON):\n${JSON.stringify(input)}` }],
    })
    if (response.stop_reason === 'refusal') {
      const err = new Error('The AI provider declined this request.')
      err.status = 422
      throw err
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (!text) {
      const err = new Error('The AI provider returned an empty response.')
      err.status = 502
      throw err
    }
    return text
  } catch (e) {
    if (e.status && !(e instanceof Anthropic.APIError)) throw e
    if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('The server API key was rejected.'), { status: 502 })
    if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error('The AI provider is rate limiting requests. Try again shortly.'), { status: 429 })
    if (e instanceof Anthropic.BadRequestError) throw Object.assign(new Error('The AI provider rejected the request.'), { status: 502 })
    if (e instanceof Anthropic.APIConnectionError) throw Object.assign(new Error('Could not reach the AI provider.'), { status: 504 })
    if (e instanceof Anthropic.APIError) throw Object.assign(new Error(`AI provider error (${e.status ?? 'unknown'}).`), { status: 502 })
    throw e
  }
}

/* ---------- HTTP ---------- */
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large.'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const started = Date.now()
  try {
    if (req.method === 'GET' && url.pathname === '/api/ai/health') {
      const c = await getClient()
      return send(res, 200, c.error ? { available: false, model: MODEL, reason: c.error } : { available: true, model: MODEL })
    }
    if (req.method === 'POST' && url.pathname === '/api/ai') {
      const raw = await readBody(req)
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return send(res, 400, { error: 'Invalid JSON.' })
      }
      if (!body || typeof body !== 'object' || !TASKS.has(body.task)) return send(res, 400, { error: 'Unknown task.' })
      if (!body.input || typeof body.input !== 'object') return send(res, 400, { error: 'Missing input.' })
      const text = await runTask(body.task, body.input)
      console.log(`[ai] ${body.task} ok ${Date.now() - started}ms`)
      return send(res, 200, { text })
    }
    send(res, 404, { error: 'Not found.' })
  } catch (e) {
    const status = e.status || 500
    console.log(`[ai] error ${status} ${Date.now() - started}ms`)
    send(res, status, { error: status === 500 ? 'Internal error.' : e.message })
  }
})

server.listen(PORT, () => {
  console.log(`DeJournal AI proxy on http://localhost:${PORT} (model ${MODEL}, key ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT set'})`)
})
