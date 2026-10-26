import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, Play, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import type { ISODate } from '@/db/types'
import type { Recommendation } from '@/domain/recommendations'
import { openDialog, toast } from '@/stores/ui'
import { cn } from '@/lib/text'
import { recordRecFeedback } from './useRecommendation'

/**
 * One compact, dismissible suggestion grounded in recorded data. Tap the text
 * to see why it was suggested and to rate it.
 */
export function RecommendationCard({ rec, date }: { rec: Recommendation; date: ISODate }) {
  const navigate = useNavigate()
  const [rated, setRated] = useState<'helpful' | 'unhelpful' | null>(null)
  const [open, setOpen] = useState(false)

  const act = async () => {
    if (!rec.action) return
    await recordRecFeedback(rec.ruleId, date, 'acted')
    switch (rec.action.kind) {
      case 'study':
        navigate('/study')
        break
      case 'task':
        openDialog({ kind: 'task', date })
        break
      case 'rate':
        openDialog({ kind: 'rating', date })
        break
      case 'tasks':
        navigate('/tasks?filter=overdue')
        break
    }
  }

  const feedback = async (v: 'helpful' | 'unhelpful') => {
    setRated(v)
    await recordRecFeedback(rec.ruleId, date, v)
    if (v === 'unhelpful') toast("Thanks — you'll see fewer suggestions like this.")
  }

  return (
    <section aria-label="Suggestion for today" className="dj-fade-in rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-center gap-2.5 py-2 pr-1.5 pl-3">
        <Lightbulb size={17} strokeWidth={1.9} className="shrink-0 text-accent" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="line-clamp-2 min-w-0 flex-1 text-left text-[13px] leading-snug text-text/90"
        >
          {rec.message}
        </button>
        {rec.action && (
          <button
            type="button"
            onClick={act}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-xs font-semibold whitespace-nowrap text-accent hover:bg-surface-3"
          >
            {rec.action.kind === 'study' && <Play size={11} fill="currentColor" aria-hidden />}
            {rec.action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss suggestion"
          onClick={() => recordRecFeedback(rec.ruleId, date, 'dismissed')}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint hover:text-text"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-muted">
          <span className="min-w-0 flex-1">Based on: {rec.reason}</span>
          {(['helpful', 'unhelpful'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === 'helpful' ? 'Helpful' : 'Not helpful'}
              aria-pressed={rated === v}
              onClick={() => feedback(v)}
              disabled={!!rated}
              className={cn('grid h-8 w-8 place-items-center rounded-lg hover:text-text disabled:opacity-60', rated === v && 'text-accent')}
            >
              {v === 'helpful' ? <ThumbsUp size={14} aria-hidden /> : <ThumbsDown size={14} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
