import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Star } from 'lucide-react'
import { Button, Field, Sheet, Textarea } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { db } from '@/db/db'
import type { DayEntry, ReflectionAnswers } from '@/db/types'
import { setRating, setReflection } from '@/db/days'
import { relativeDayLabel } from '@/lib/dates'
import { cn } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'

export const REFLECTION_PROMPTS: Array<{ key: keyof ReflectionAnswers; label: string }> = [
  { key: 'wentWell', label: 'What went well today?' },
  { key: 'difficult', label: 'What was difficult?' },
  { key: 'learned', label: 'What did I learn?' },
  { key: 'differently', label: 'What would I do differently tomorrow?' },
]

type Rating = NonNullable<DayEntry['rating']>

/** Rate a day (1–5, optional) and answer optional reflection prompts. */
export default function RatingDialog({ request, onClose }: DialogProps<'rating'>) {
  const settings = useSettings()
  const date = request.date
  const day = useLiveQuery(async () => (await db.days.get(date)) ?? null, [date])
  const [rating, setLocalRating] = useState<Rating | null>(null)
  const [answers, setAnswers] = useState<ReflectionAnswers>({})
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (day === undefined || loaded) return
    setLocalRating((day?.rating as Rating | null | undefined) ?? null)
    setAnswers(day?.reflection ?? {})
    setLoaded(true)
  }, [day, loaded])

  async function save() {
    setBusy(true)
    try {
      await setRating(date, rating)
      const cleaned: ReflectionAnswers = {}
      for (const p of REFLECTION_PROMPTS) {
        const v = answers[p.key]?.trim()
        if (v) cleaned[p.key] = v
      }
      await setReflection(date, cleaned)
      toast('Saved')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Could not save.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Reflect on your day"
      description={relativeDayLabel(date, settings.dateFormat)}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-[13px] font-medium text-muted">
          <span>How was the day?</span>
          {rating !== null && (
            <button type="button" onClick={() => setLocalRating(null)} className="text-xs font-medium text-accent hover:underline">
              Clear rating
            </button>
          )}
        </legend>
        <div role="radiogroup" aria-label="Day rating" className="grid grid-cols-5 gap-1.5">
          {([1, 2, 3, 4, 5] as Rating[]).map((n) => {
            const on = rating === n
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setLocalRating(on ? null : n)}
                className={cn(
                  'flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center transition-colors',
                  on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted hover:text-text',
                )}
              >
                <span className="flex items-center gap-0.5 text-lg font-semibold tabular-nums">
                  {n}
                  <Star size={13} fill={on ? 'currentColor' : 'none'} aria-hidden />
                </span>
                <span className="text-[10.5px] leading-tight">{settings.ratingLabels[n - 1]}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-faint">Optional. Skip it on days you'd rather not rate.</p>
      </fieldset>

      <div className="mt-6 flex flex-col gap-4">
        <p className="text-[13px] text-muted">A few prompts, if you feel like writing. Answer any, all, or none.</p>
        {REFLECTION_PROMPTS.map((p) => (
          <Field key={p.key} label={p.label} optional>
            {(fp) => (
              <Textarea
                {...fp}
                rows={2}
                value={answers[p.key] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.value }))}
              />
            )}
          </Field>
        ))}
      </div>
    </Sheet>
  )
}
