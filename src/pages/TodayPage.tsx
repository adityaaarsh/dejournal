import { Fragment, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '@/components/ui'
import type { ISODate } from '@/db/types'
import { isISODate, today } from '@/lib/dates'
import { useSettings, type DashboardSectionId } from '@/stores/settings'
import { TodayHeader } from '@/features/today/TodayHeader'
import { RecommendationCard } from '@/features/today/RecommendationCard'
import { useRecommendation } from '@/features/today/useRecommendation'
import { HighlightRow, MoodCard, SpendingCard, StudyCard, TodoCard } from '@/features/today/Cards'
import { ScreenTimeCard } from '@/features/today/ScreenTimeCard'
import { ActivitySection, AgendaSection, RoutinesSection } from '@/features/today/Sections'

/** Sections laid out as tiles in a two-column grid when they sit next to each other. */
const GRID_SECTIONS: DashboardSectionId[] = ['study', 'expenses', 'screentime']

/**
 * Today dashboard. The selected date comes from `?d=YYYY-MM-DD` (default: today).
 * The default layout fits one phone screen without scrolling; extra sections
 * (agenda, routines, recent activity) can be turned on in Settings → Dashboard.
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
        return <MoodCard date={date} settings={settings} />
      case 'study':
        return <StudyCard date={date} settings={settings} />
      case 'expenses':
        return <SpendingCard date={date} settings={settings} />
      case 'screentime':
        return <ScreenTimeCard date={date} />
      case 'highlight':
        return <HighlightRow date={date} />
      case 'tasks':
        return <TodoCard date={date} />
      case 'agenda':
        return <AgendaSection date={date} />
      case 'routines':
        return <RoutinesSection date={date} />
      case 'activity':
        return <ActivitySection date={date} />
      default:
        return null
    }
  }

  // Consecutive tile sections share one grid; screen time spans both columns.
  const visible = settings.dashboard.filter((s) => s.visible).map((s) => s.id)
  const blocks: Array<{ key: string; node: ReactNode }> = []
  for (let i = 0; i < visible.length; i++) {
    if (GRID_SECTIONS.includes(visible[i])) {
      const group: DashboardSectionId[] = []
      while (i < visible.length && GRID_SECTIONS.includes(visible[i])) group.push(visible[i++])
      i--
      blocks.push({
        key: group.join('-'),
        node: (
          <div className="grid grid-cols-2 gap-2">
            {group.map((id) => {
              const lone = id !== 'screentime' && group.filter((g) => g !== 'screentime').length === 1
              return (
                <div key={id} className={id === 'screentime' || lone ? 'col-span-2 grid' : 'grid'}>
                  {render(id)}
                </div>
              )
            })}
          </div>
        ),
      })
    } else {
      blocks.push({ key: visible[i], node: render(visible[i]) })
    }
  }

  return (
    <Page className="pb-24">
      <TodayHeader date={date} onDate={setDate} weekStartsOn={settings.weekStartsOn} />
      <div key={date} className="dj-fade-in flex flex-col gap-2">
        {blocks.map((b) => (
          <Fragment key={b.key}>{b.node}</Fragment>
        ))}
      </div>
    </Page>
  )
}
