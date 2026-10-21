import { Fragment, useCallback, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { Page } from '@/components/ui'
import type { ISODate } from '@/db/types'
import { isISODate, today } from '@/lib/dates'
import { useSettings, type DashboardSectionId } from '@/stores/settings'
import { TodayHeader } from '@/features/today/TodayHeader'
import { RecommendationCard } from '@/features/today/RecommendationCard'
import { useRecommendation } from '@/features/today/useRecommendation'
import {
  ActivitySection,
  AgendaSection,
  ExpensesTile,
  HighlightSection,
  RatingSection,
  RoutinesSection,
  StudyTile,
  TasksSection,
} from '@/features/today/Sections'

const TILE_SECTIONS: DashboardSectionId[] = ['study', 'expenses']

/**
 * Today dashboard. The selected date comes from `?d=YYYY-MM-DD` (default: today),
 * so every section shows that date's records and history is never mixed in.
 */
export default function TodayPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const raw = params.get('d')
  const date: ISODate = isISODate(raw) ? raw : today()
  const isToday = date === today()

  const setDate = useCallback(
    (d: ISODate) => {
      setParams(d === today() ? {} : { d }, { replace: true })
    },
    [setParams],
  )

  const rec = useRecommendation(date, settings.studyGoalDailyMin, settings.recommendationsEnabled && isToday)

  const render = (id: DashboardSectionId): ReactNode => {
    switch (id) {
      case 'recommendation':
        return rec ? <RecommendationCard rec={rec} date={date} /> : null
      case 'rating':
        return <RatingSection date={date} settings={settings} />
      case 'highlight':
        return <HighlightSection date={date} />
      case 'tasks':
        return <TasksSection date={date} settings={settings} />
      case 'agenda':
        return <AgendaSection date={date} />
      case 'routines':
        return <RoutinesSection date={date} />
      case 'study':
        return <StudyTile date={date} settings={settings} />
      case 'expenses':
        return <ExpensesTile date={date} settings={settings} />
      case 'activity':
        return <ActivitySection date={date} />
    }
  }

  // Build blocks in the user's order; adjacent stat tiles share a two-column row.
  const visible = settings.dashboard.filter((s) => s.visible).map((s) => s.id)
  const blocks: Array<{ key: string; node: ReactNode }> = []
  for (let i = 0; i < visible.length; i++) {
    const id = visible[i]
    const next = visible[i + 1]
    if (TILE_SECTIONS.includes(id) && next && TILE_SECTIONS.includes(next)) {
      blocks.push({
        key: `${id}-${next}`,
        node: (
          <div className="grid grid-cols-2 gap-3">
            {render(id)}
            {render(next)}
          </div>
        ),
      })
      i++
    } else {
      blocks.push({ key: id, node: render(id) })
    }
  }

  return (
    <Page>
      <TodayHeader date={date} onDate={setDate} dateFormat={settings.dateFormat} />
      <div key={date} className="dj-fade-in mt-2 flex flex-col gap-3">
        {blocks.map((b) => (
          <Fragment key={b.key}>{b.node}</Fragment>
        ))}
        <div className="flex justify-center pt-3">
          <Link
            to="/settings#dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-faint hover:bg-surface-2 hover:text-text"
          >
            <SlidersHorizontal size={14} aria-hidden /> Customize dashboard
          </Link>
        </div>
      </div>
    </Page>
  )
}
