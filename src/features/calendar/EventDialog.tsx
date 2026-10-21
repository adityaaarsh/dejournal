import { useState } from 'react'
import { CalendarDays, Clock, Lock, MapPin, Trash2 } from 'lucide-react'
import { Button, Field, Input, Notice, Sheet, Textarea, Toggle } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { formatDate, formatTime, isISODate, today } from '@/lib/dates'
import { toast } from '@/stores/ui'
import { createEvent, deleteEvent, sourceLabel, updateEvent } from './events'

export default function EventDialog({ request, onClose }: DialogProps<'event'>) {
  const ev = request.event
  const readOnly = !!ev && ev.source !== 'local'

  if (ev && readOnly) {
    const label = sourceLabel(ev)
    return (
      <Sheet title={ev.title} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <div className="flex flex-col gap-4">
          <Notice icon={Lock}>
            Imported from <span className="font-medium text-text">{label}</span>. Imported events are read-only in DeJournal; change them in the
            original calendar and sync again.
          </Notice>
          <dl className="flex flex-col gap-3 text-[15px]">
            <div className="flex gap-3">
              <dt>
                <CalendarDays size={18} className="mt-0.5 text-muted" aria-label="Date" />
              </dt>
              <dd>
                {formatDate(ev.date, ev.endDate ? 'EEE, d MMM yyyy' : 'EEEE, d MMMM yyyy')}
                {ev.endDate && ` – ${formatDate(ev.endDate, 'EEE, d MMM yyyy')}`}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt>
                <Clock size={18} className="mt-0.5 text-muted" aria-label="Time" />
              </dt>
              <dd>{ev.allDay ? 'All day' : [formatTime(ev.startTime), formatTime(ev.endTime)].filter(Boolean).join(' – ')}</dd>
            </div>
            {ev.location && (
              <div className="flex gap-3">
                <dt>
                  <MapPin size={18} className="mt-0.5 text-muted" aria-label="Location" />
                </dt>
                <dd>{ev.location}</dd>
              </div>
            )}
          </dl>
          {ev.description && <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted">{ev.description}</p>}
        </div>
      </Sheet>
    )
  }

  return <EventForm request={request} onClose={onClose} />
}

function EventForm({ request, onClose }: DialogProps<'event'>) {
  const ev = request.event
  const [title, setTitle] = useState(ev?.title ?? '')
  const [date, setDate] = useState(ev?.date ?? request.date ?? today())
  const [multiDay, setMultiDay] = useState(!!ev?.endDate)
  const [endDate, setEndDate] = useState(ev?.endDate ?? '')
  const [allDay, setAllDay] = useState(ev?.allDay ?? false)
  const [startTime, setStartTime] = useState(ev?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(ev?.endTime ?? '10:00')
  const [location, setLocation] = useState(ev?.location ?? '')
  const [description, setDescription] = useState(ev?.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Give the event a title.'
    if (!isISODate(date)) e.date = 'Choose a valid date.'
    if (multiDay) {
      if (!isISODate(endDate)) e.endDate = 'Choose an end date.'
      else if (endDate < date) e.endDate = 'End date must be on or after the start date.'
    }
    if (!allDay) {
      if (!startTime) e.startTime = 'Choose a start time.'
      // Same-day events must end after they start.
      if (startTime && endTime && (!multiDay || endDate === date) && endTime <= startTime) e.endTime = 'End time must be after the start time.'
    }
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const input = {
        title,
        date,
        endDate: multiDay ? endDate : null,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime || null,
        location,
        description,
      }
      if (ev) await updateEvent(ev.id, input)
      else await createEvent(input)
      toast(ev ? 'Event updated' : 'Event added', { tone: 'success' })
      onClose()
    } catch (err) {
      console.error(err)
      toast('Could not save the event.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={ev ? 'Edit event' : 'New event'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {ev && (
            <Button
              variant="danger"
              icon={Trash2}
              className="mr-auto"
              onClick={async () => {
                await deleteEvent(ev.id)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" error={errors.title}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dentist appointment" autoFocus maxLength={200} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={multiDay ? 'Starts' : 'Date'} error={errors.date}>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          {multiDay ? (
            <Field label="Ends" error={errors.endDate}>
              {(p) => <Input {...p} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />}
            </Field>
          ) : (
            <div />
          )}
        </div>
        <div className="-my-1 flex flex-col">
          <Toggle label="All day" checked={allDay} onChange={setAllDay} />
          <Toggle
            label="Spans several days"
            checked={multiDay}
            onChange={(v) => {
              setMultiDay(v)
              if (v && !endDate) setEndDate(date)
            }}
          />
        </div>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" error={errors.startTime}>
              {(p) => <Input {...p} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
            </Field>
            <Field label="End time" error={errors.endTime} optional>
              {(p) => <Input {...p} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
            </Field>
          </div>
        )}
        <Field label="Location" optional>
          {(p) => <Input {...p} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where?" maxLength={200} />}
        </Field>
        <Field label="Description" optional>
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />}
        </Field>
      </div>
    </Sheet>
  )
}
