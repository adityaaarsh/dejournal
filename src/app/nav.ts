import {
  BookHeart,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Clock,
  Images,
  ListChecks,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  PieChart,
  Plug,
  Repeat,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Sun,
  Bell,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  description?: string
}

/** The five primary destinations (bottom nav on mobile, sidebar on desktop). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/recap', label: 'Recap', icon: PieChart },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/more', label: 'More', icon: MoreHorizontal },
]

/** Secondary modules listed under More. */
export const MORE_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Daily',
    items: [
      { to: '/tasks', label: 'Tasks', icon: ListChecks, description: 'All tasks, overdue and filters' },
      { to: '/notes', label: 'Notes', icon: NotebookPen, description: 'Pinned, dated and tagged notes' },
      { to: '/expenses', label: 'Expenses', icon: Wallet, description: 'Daily spending and categories' },
      { to: '/study', label: 'Study', icon: BookOpen, description: 'Timer, sessions and goals' },
      { to: '/photos', label: 'Photos', icon: Images, description: 'Daily selfies and photo diary' },
      { to: '/reminders', label: 'Reminders', icon: Bell, description: 'One-time and repeating reminders' },
    ],
  },
  {
    title: 'Reflect',
    items: [
      { to: '/journal', label: 'Journal', icon: BookHeart, description: 'Ratings and reflections' },
      { to: '/highlights', label: 'Highlights', icon: Sparkles, description: 'Best moments, by day' },
      { to: '/routines', label: 'Routines', icon: Repeat, description: 'Small habits you track' },
    ],
  },
  {
    title: 'Optional',
    items: [
      { to: '/focus', label: 'Focus mode', icon: Timer, description: 'Distraction-reduced timer' },
      { to: '/places', label: 'Places', icon: MapPin, description: 'Places and location memories' },
      { to: '/screen-time', label: 'Screen time', icon: Smartphone, description: 'Log and review screen time' },
      { to: '/integrations', label: 'Integrations', icon: Plug, description: 'Calendars, AI and maps' },
    ],
  },
  {
    title: 'App',
    items: [{ to: '/settings', label: 'Settings', icon: Settings, description: 'Appearance, privacy, data' }],
  },
]

export const CALENDAR_ICON = CalendarRange
export const CLOCK_ICON = Clock
