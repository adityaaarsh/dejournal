import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import type { ISODate } from '@/db/types'
import type { Recommendation } from '@/domain/recommendations'
import { openDialog, toast } from '@/stores/ui'
import { cn } from '@/lib/text'
import { recordRecFeedback } from './useRecommendation'

/** One compact, dismissible suggestion grounded in recorded data. */
export function RecommendationCard({ rec, date }: { rec: Recommendation; date: ISODate }) {
  const navigate = useNavigate()
  const [rated, setRated] = useState<'helpful' | 'unhelpful' | null>(null)
  const [why, setWhy] = useState(false)

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
    <section
      aria-label="Suggestion for today"
      className="dj-fade-in rounded-[var(--radius-card)] border border-warn-line bg-warn-soft p-3.5 pr-2"
    >
      <div className="flex items-start gap-3">
        <Lightbulb size={18} strokeWidth={1.9} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-warn">{rec.message}</p>
          {why && <p className="mt-1.5 text-xs text-muted">Based on: {rec.reason}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            {rec.action && (
              <button
                type="button"
                onClick={act}
                className="mr-1 h-8 rounded-lg bg-warn/15 px-3 text-[13px] font-medium text-warn hover:bg-warn/25"
              >
                {rec.action.label}
              </button>
            )}
            <button type="button" onClick={() => setWhy((w) => !w)} className="h-8 rounded-lg px-2 text-xs text-muted hover:text-text">
              {why ? 'Hide reason' : 'Why?'}
            </button>
            <span className="ml-auto flex items-center">
              <button
                type="button"
                aria-label="Helpful"
                aria-pressed={rated === 'helpful'}
                onClick={() => feedback('helpful')}
                disabled={!!rated}
                className={cn('grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-text disabled:opacity-60', rated === 'helpful' && 'text-warn')}
              >
                <ThumbsUp size={15} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Not helpful"
                aria-pressed={rated === 'unhelpful'}
                onClick={() => feedback('unhelpful')}
                disabled={!!rated}
                className={cn('grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-text disabled:opacity-60', rated === 'unhelpful' && 'text-warn')}
              >
                <ThumbsDown size={15} aria-hidden />
              </button>
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss suggestion"
          onClick={() => recordRecFeedback(rec.ruleId, date, 'dismissed')}
          className="-mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:text-text"
        >
          <X size={17} aria-hidden />
        </button>
      </div>
    </section>
  )
}
