import { lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './AppShell'
import { RouteError } from './RouteError'

/* Pages are code-split so the Today screen loads fast. */
const TodayPage = lazy(() => import('@/pages/TodayPage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const JournalPage = lazy(() => import('@/pages/JournalPage'))
const RoutinesPage = lazy(() => import('@/pages/RoutinesPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const RemindersPage = lazy(() => import('@/pages/RemindersPage'))
const IntegrationsPage = lazy(() => import('@/pages/IntegrationsPage'))
const StudyPage = lazy(() => import('@/pages/StudyPage'))
const ExpensesPage = lazy(() => import('@/pages/ExpensesPage'))
const FocusPage = lazy(() => import('@/pages/FocusPage'))
const ScreenTimePage = lazy(() => import('@/pages/ScreenTimePage'))
const PhotosPage = lazy(() => import('@/pages/PhotosPage'))
const NotesPage = lazy(() => import('@/pages/NotesPage'))
const NoteEditorPage = lazy(() => import('@/pages/NoteEditorPage'))
const HighlightsPage = lazy(() => import('@/pages/HighlightsPage'))
const PlacesPage = lazy(() => import('@/pages/PlacesPage'))
const RecapPage = lazy(() => import('@/pages/RecapPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const MorePage = lazy(() => import('@/pages/MorePage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <TodayPage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/journal', element: <JournalPage /> },
      { path: '/routines', element: <RoutinesPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/reminders', element: <RemindersPage /> },
      { path: '/integrations', element: <IntegrationsPage /> },
      { path: '/study', element: <StudyPage /> },
      { path: '/expenses', element: <ExpensesPage /> },
      { path: '/focus', element: <FocusPage /> },
      { path: '/screen-time', element: <ScreenTimePage /> },
      { path: '/photos', element: <PhotosPage /> },
      { path: '/notes', element: <NotesPage /> },
      { path: '/notes/:id', element: <NoteEditorPage /> },
      { path: '/highlights', element: <HighlightsPage /> },
      { path: '/places', element: <PlacesPage /> },
      { path: '/recap', element: <RecapPage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/more', element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
