import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Bold,
  CalendarDays,
  Check,
  Code,
  Heading,
  Italic,
  List,
  ListChecks,
  NotebookPen,
  Pin,
  PinOff,
  Trash,
  X,
} from 'lucide-react'
import { Card, EmptyState, Field, IconButton, LoadingState, NavSquare, Page, PageHeader, Segmented, TagInput } from '@/components/ui'
import { db } from '@/db/db'
import { createRecord, removeWithUndo, updateRecord } from '@/db/repo'
import type { Note } from '@/db/types'
import { isISODate, relativeDayLabel } from '@/lib/dates'
import { cn } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { Markdown } from '@/features/notes/markdown'
import { applyFormat, type FormatAction } from '@/features/notes/markdownParse'

const AUTOSAVE_MS = 600

type Fields = Pick<Note, 'title' | 'content' | 'tags' | 'pinned' | 'archived'> & { date: string }

const TOOLBAR: Array<{ action: FormatAction; label: string; icon: typeof Bold }> = [
  { action: 'bold', label: 'Bold', icon: Bold },
  { action: 'italic', label: 'Italic', icon: Italic },
  { action: 'heading', label: 'Heading', icon: Heading },
  { action: 'bullet', label: 'Bullet list', icon: List },
  { action: 'check', label: 'Checklist', icon: ListChecks },
  { action: 'code', label: 'Inline code', icon: Code },
]

/**
 * Wrapper keeps the editor mounted when a brand-new note gets its id
 * (/notes/new → /notes/:id), so typing and focus are not interrupted.
 */
export default function NoteEditorPage() {
  const { id = 'new' } = useParams()
  const createdRef = useRef<string | null>(null)
  const [key, setKey] = useState(id)
  if (id !== key && id !== createdRef.current) {
    createdRef.current = null
    setKey(id)
  }
  return <Editor key={key} routeId={id} onCreated={(newId) => (createdRef.current = newId)} />
}

function Editor({ routeId, onCreated }: { routeId: string; onCreated: (id: string) => void }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const [params] = useSearchParams()
  const isNew = routeId === 'new'
  const initialDate = isNew && isISODate(params.get('date')) ? params.get('date')! : ''

  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>(isNew ? 'ready' : 'loading')
  const [fields, setFields] = useState<Fields>({ title: '', content: '', tags: [], pinned: false, archived: false, date: initialDate })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [mode, setMode] = useState<'write' | 'preview'>('write')

  const idRef = useRef<string | null>(isNew ? null : routeId)
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const deletedRef = useRef(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const onCreatedRef = useRef(onCreated)
  onCreatedRef.current = onCreated

  // Load an existing note once.
  useEffect(() => {
    if (isNew) return
    let cancelled = false
    db.notes.get(routeId).then((n) => {
      if (cancelled) return
      if (!n) return setStatus('notfound')
      setFields({ title: n.title, content: n.content, tags: n.tags, pinned: n.pinned, archived: n.archived, date: n.date ?? '' })
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [isNew, routeId])

  /** Persist the latest fields. Saves are serialised so a new note is created exactly once. */
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (!dirtyRef.current || deletedRef.current) return chainRef.current
    dirtyRef.current = false
    chainRef.current = chainRef.current.then(async () => {
      const f = fieldsRef.current
      const data = {
        title: f.title.trim(),
        content: f.content,
        tags: f.tags,
        pinned: f.pinned,
        archived: f.archived,
        date: isISODate(f.date) ? f.date : null,
      }
      setSaveState('saving')
      try {
        if (!idRef.current) {
          if (!data.title && !data.content.trim()) {
            setSaveState('idle')
            return
          }
          const rec = await createRecord(db.notes, data)
          idRef.current = rec.id
          onCreatedRef.current(rec.id)
          navigate(`/notes/${rec.id}`, { replace: true })
        } else {
          await updateRecord(db.notes, idRef.current, data)
        }
        setSaveState('saved')
      } catch (e) {
        console.error(e)
        dirtyRef.current = true
        setSaveState('error')
      }
    })
    return chainRef.current
  }, [navigate])

  const change = (patch: Partial<Fields>, immediate = false) => {
    setFields((f) => ({ ...f, ...patch }))
    fieldsRef.current = { ...fieldsRef.current, ...patch }
    dirtyRef.current = true
    setSaveState('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    if (immediate) void flush()
    else timerRef.current = setTimeout(() => void flush(), AUTOSAVE_MS)
  }

  // Save pending edits when leaving the page or hiding the tab.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      void flush()
    }
  }, [flush])

  const format = (action: FormatAction) => {
    const ta = textRef.current
    if (!ta) return
    const r = applyFormat(fields.content, ta.selectionStart, ta.selectionEnd, action)
    change({ content: r.value })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(r.start, r.end)
    })
  }

  // Auto-grow the textarea.
  useEffect(() => {
    const ta = textRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 280)}px`
  }, [fields.content, mode, status])

  const remove = async () => {
    await flush()
    const id = idRef.current
    deletedRef.current = true
    if (id) await removeWithUndo(db.notes, id, 'Note')
    navigate('/notes', { replace: true })
  }

  if (status === 'loading') return <LoadingState />
  if (status === 'notfound')
    return (
      <Page>
        <PageHeader title="Note" back="/notes" />
        <EmptyState
          icon={NotebookPen}
          title="Note not found"
          description="It may have been deleted."
          action={
            <Link to="/notes" className="text-sm text-accent">
              Back to notes
            </Link>
          }
        />
      </Page>
    )

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : idRef.current ? '' : 'Draft'

  return (
    <Page>
      <PageHeader
        title={isNew && !idRef.current ? 'New note' : 'Note'}
        back="/notes"
        actions={
          <>
            <span
              aria-live="polite"
              className={cn(
                'mr-0.5 inline-flex items-center gap-1 text-xs',
                saveState === 'error' ? 'text-danger' : 'text-faint',
              )}
            >
              {saveState === 'saved' && <Check size={12} aria-hidden />}
              {saveLabel}
            </span>
            <NavSquare
              icon={fields.pinned ? PinOff : Pin}
              label={fields.pinned ? 'Unpin' : 'Pin'}
              active={fields.pinned}
              onClick={() => change({ pinned: !fields.pinned }, true)}
            />
            <NavSquare
              icon={fields.archived ? ArchiveRestore : Archive}
              label={fields.archived ? 'Unarchive' : 'Archive'}
              onClick={() => {
                change({ archived: !fields.archived }, true)
                toast(fields.archived ? 'Note restored' : 'Note archived')
              }}
              disabled={!idRef.current && !fields.title && !fields.content}
            />
            <NavSquare icon={Trash} label="Delete note" onClick={remove} disabled={!idRef.current} className="hover:text-danger" />
          </>
        }
      />

      {fields.archived && (
        <p className="mb-3 rounded-2xl border border-line bg-surface px-3 py-2 text-[13px] text-muted">This note is archived. It stays searchable.</p>
      )}

      <input
        value={fields.title}
        onChange={(e) => change({ title: e.target.value })}
        placeholder="Title"
        aria-label="Note title"
        maxLength={200}
        autoFocus={isNew}
        className="w-full bg-transparent font-display text-[22px] leading-tight font-semibold tracking-tight placeholder:text-faint focus:outline-none focus-visible:outline-none"
      />

      <Card className="mt-3 grid grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,200px)_1fr]">
        <Field label="Day" optional>
          {(p) => (
            <div className="flex items-center gap-1">
              <input
                {...p}
                type="date"
                value={fields.date}
                onChange={(e) => change({ date: e.target.value }, true)}
                className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-[15px] focus:border-accent focus:outline-none"
              />
              {fields.date && <IconButton icon={X} label="Unlink day" size="sm" onClick={() => change({ date: '' }, true)} />}
            </div>
          )}
        </Field>
        <Field label="Tags" optional>
          {(p) => <TagInput id={p.id} value={fields.tags} onChange={(tags) => change({ tags }, true)} />}
        </Field>
      </Card>
      {isISODate(fields.date) && (
        <Link to={`/?d=${fields.date}`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          <CalendarDays size={12} aria-hidden /> Open {relativeDayLabel(fields.date, settings.dateFormat)}
        </Link>
      )}

      <div className="sticky top-[calc(max(env(safe-area-inset-top),10px)+56px)] z-10 mt-3 flex items-center gap-2 bg-bg py-2">
        {mode === 'write' && (
          <div role="toolbar" aria-label="Formatting" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-full border border-line bg-surface p-1 scrollbar-none">
            {TOOLBAR.map((t) => (
              <button
                key={t.action}
                type="button"
                aria-label={t.label}
                title={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => format(t.action)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <t.icon size={16} strokeWidth={2} aria-hidden />
              </button>
            ))}
          </div>
        )}
        <Segmented
          label="Editor mode"
          size="sm"
          className="ml-auto shrink-0"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
      </div>

      <Card className="px-4 py-3">
      {mode === 'write' ? (
        <textarea
          ref={textRef}
          value={fields.content}
          onChange={(e) => change({ content: e.target.value })}
          aria-label="Note content"
          placeholder="Start writing… Use **bold**, _italic_, # headings, - lists and - [ ] checklists."
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed placeholder:text-faint focus:outline-none focus-visible:outline-none"
        />
      ) : fields.content.trim() ? (
        <Markdown source={fields.content} />
      ) : (
        <p className="text-sm text-faint">Nothing to preview yet.</p>
      )}
      </Card>
    </Page>
  )
}
