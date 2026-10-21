/**
 * Optional AI provider abstraction.
 *
 * The app never holds an API key. `ServerProxyProvider` talks to our own
 * backend (`/api/ai`, see server/ai-proxy.mjs), which holds the key. Other
 * providers can implement `AIProvider` without touching the UI.
 *
 * `getAIProvider(settings)` returns null unless the user enabled AI *and*
 * consented to sending data — so nothing leaves the device by default.
 */
import type { Settings } from '@/stores/settings'

export type AITask = 'month-summary' | 'plan-tomorrow' | 'day-summary'

export interface AIProvider {
  id: string
  label: string
  isAvailable(): Promise<boolean>
  /** Human-readable status for Settings (model name or why unavailable). */
  status(): Promise<{ available: boolean; detail: string }>
  complete(task: AITask, input: object, signal?: AbortSignal): Promise<string>
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly kind: 'unavailable' | 'rate-limit' | 'timeout' | 'network' | 'provider' | 'aborted',
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 30_000

export class ServerProxyProvider implements AIProvider {
  id = 'server-proxy'
  label = 'DeJournal AI server'
  constructor(private readonly base = '/api/ai') {}

  async status(): Promise<{ available: boolean; detail: string }> {
    try {
      const res = await fetch(`${this.base}/health`, { headers: { accept: 'application/json' } })
      if (!res.ok) return { available: false, detail: 'AI server is not running.' }
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('json')) return { available: false, detail: 'AI server is not running.' }
      const body = (await res.json()) as { available?: boolean; model?: string; reason?: string }
      return body.available ? { available: true, detail: `Connected · ${body.model ?? 'model'}` } : { available: false, detail: body.reason ?? 'Not configured.' }
    } catch {
      return { available: false, detail: 'AI server is not reachable.' }
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.status()).available
  }

  async complete(task: AITask, input: object, signal?: AbortSignal): Promise<string> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS)
    const onAbort = () => ctrl.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort)
    try {
      const res = await fetch(this.base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task, input }),
        signal: ctrl.signal,
      })
      let body: { text?: string; error?: string } = {}
      try {
        body = await res.json()
      } catch {
        /* non-JSON error page */
      }
      if (res.ok && body.text) return body.text
      if (res.status === 429) throw new AIError(body.error ?? 'Too many requests. Try again in a minute.', 'rate-limit')
      if (res.status === 503 || res.status === 404) throw new AIError(body.error ?? 'AI is not configured on the server.', 'unavailable')
      if (res.status === 504) throw new AIError(body.error ?? 'The AI provider took too long to respond.', 'timeout')
      throw new AIError(body.error ?? `AI request failed (${res.status}).`, 'provider')
    } catch (e) {
      if (e instanceof AIError) throw e
      if (ctrl.signal.aborted) {
        if (signal?.aborted) throw new AIError('Cancelled.', 'aborted')
        throw new AIError('The AI request timed out.', 'timeout')
      }
      throw new AIError('Could not reach the AI server.', 'network')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

let shared: ServerProxyProvider | null = null

/** The configured provider, or null when AI is off or not consented to. */
export function getAIProvider(settings: Pick<Settings, 'aiEnabled' | 'aiConsent'>): AIProvider | null {
  if (!settings.aiEnabled || !settings.aiConsent) return null
  shared ??= new ServerProxyProvider()
  return shared
}

/** Provider regardless of consent — for status checks in Settings only. */
export function getProviderForStatus(): AIProvider {
  shared ??= new ServerProxyProvider()
  return shared
}
