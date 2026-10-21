import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  CalendarEvent,
  DayEntry,
  Expense,
  ExpenseCategory,
  FocusSession,
  Highlight,
  IntegrationConnection,
  KV,
  MonthlyReflection,
  Note,
  Photo,
  PhotoFile,
  RecommendationFeedback,
  Reminder,
  Routine,
  RoutineLog,
  SavedPlace,
  ScreenTimeRecord,
  StudySession,
  StudySubject,
  Task,
  TaskSeries,
} from './types'

/**
 * IndexedDB database (via Dexie). Schema strings list the primary key first,
 * then indexed fields. '&' = unique, '*' = multi-entry (arrays), '[a+b]' = compound.
 *
 * Migrations: bump the version number and add a new `this.version(n).stores({...})`
 * block (plus `.upgrade(tx => ...)` when data needs transforming). Never edit an
 * older version block once it has shipped.
 */
export class DeJournalDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  taskSeries!: EntityTable<TaskSeries, 'id'>
  reminders!: EntityTable<Reminder, 'id'>
  events!: EntityTable<CalendarEvent, 'id'>
  days!: Table<DayEntry, string>
  highlights!: EntityTable<Highlight, 'id'>
  notes!: EntityTable<Note, 'id'>
  photos!: EntityTable<Photo, 'id'>
  photoFiles!: EntityTable<PhotoFile, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  expenseCategories!: EntityTable<ExpenseCategory, 'id'>
  studySubjects!: EntityTable<StudySubject, 'id'>
  studySessions!: EntityTable<StudySession, 'id'>
  focusSessions!: EntityTable<FocusSession, 'id'>
  places!: EntityTable<SavedPlace, 'id'>
  screenTime!: EntityTable<ScreenTimeRecord, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routineLogs!: EntityTable<RoutineLog, 'id'>
  recFeedback!: EntityTable<RecommendationFeedback, 'id'>
  monthlyReflections!: Table<MonthlyReflection, string>
  integrations!: EntityTable<IntegrationConnection, 'id'>
  kv!: Table<KV, string>

  constructor(name = 'dejournal') {
    super(name)
    this.version(1).stores({
      tasks: 'id, date, seriesId, [seriesId+date], completed, priority, category, *tags, updatedAt',
      taskSeries: 'id, startDate',
      reminders: 'id, date, taskId, status',
      events: 'id, date, source, connectionId, externalId, [connectionId+externalId]',
      days: 'date, rating',
      highlights: 'id, &date, *tags',
      notes: 'id, date, pinned, archived, *tags, updatedAt, createdAt',
      photos: 'id, date, isSelfie, *tags, createdAt',
      photoFiles: 'id',
      expenses: 'id, date, categoryId',
      expenseCategories: 'id, order',
      studySubjects: 'id, name',
      studySessions: 'id, date, subjectId',
      focusSessions: 'id, date',
      places: 'id, date',
      screenTime: 'id, &date',
      routines: 'id, order',
      routineLogs: 'id, routineId, date',
      recFeedback: 'id, ruleId, date',
      monthlyReflections: 'month, date',
      integrations: 'id, kind',
      kv: 'key',
    })

    this.on('populate', (tx) => {
      tx.table('expenseCategories').bulkAdd(DEFAULT_EXPENSE_CATEGORIES)
    })
  }
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'food', name: 'Food', icon: 'utensils', builtin: true, order: 0 },
  { id: 'transport', name: 'Transport', icon: 'bus', builtin: true, order: 1 },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', builtin: true, order: 2 },
  { id: 'education', name: 'Education', icon: 'graduation-cap', builtin: true, order: 3 },
  { id: 'bills', name: 'Bills', icon: 'receipt', builtin: true, order: 4 },
  { id: 'entertainment', name: 'Entertainment', icon: 'clapperboard', builtin: true, order: 5 },
  { id: 'health', name: 'Health', icon: 'heart-pulse', builtin: true, order: 6 },
  { id: 'other', name: 'Other', icon: 'circle-dot', builtin: true, order: 7 },
]

export const db = new DeJournalDB()

/** Names of every table — used by export / import / delete-all. */
export const ALL_TABLES = [
  'tasks',
  'taskSeries',
  'reminders',
  'events',
  'days',
  'highlights',
  'notes',
  'photos',
  'photoFiles',
  'expenses',
  'expenseCategories',
  'studySubjects',
  'studySessions',
  'focusSessions',
  'places',
  'screenTime',
  'routines',
  'routineLogs',
  'recFeedback',
  'monthlyReflections',
  'integrations',
  'kv',
] as const

export type TableName = (typeof ALL_TABLES)[number]
