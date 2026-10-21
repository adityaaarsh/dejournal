import { describe, expect, it } from 'vitest'
import { expandRule, parseDateValue, parseDuration, parseIcs, parseRRule, unescapeText, unfold } from './ics'
import { toISODate } from './dates'

const wrap = (body: string, extra = '') =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', extra, body, 'END:VCALENDAR'].filter(Boolean).join('\r\n')

const W = { windowStart: '2026-01-01', windowEnd: '2027-12-31' }

describe('ics helpers', () => {
  it('unfolds continuation lines', () => {
    expect(unfold('SUMMARY:Hello\r\n  world\r\nUID:1')).toEqual(['SUMMARY:Hello world', 'UID:1'])
  })

  it('unescapes text', () => {
    expect(unescapeText('a\\, b\\; c\\nd\\\\e')).toBe('a, b; c\nd\\e')
  })

  it('parses durations', () => {
    expect(parseDuration('PT1H30M')).toBe(90)
    expect(parseDuration('P1D')).toBe(1440)
    expect(parseDuration('P1W')).toBe(10080)
    expect(parseDuration('nope')).toBeNull()
  })

  it('converts UTC times to local wall-clock', () => {
    const v = parseDateValue('20261022T093000Z')!
    const local = new Date(Date.UTC(2026, 9, 22, 9, 30))
    expect(v.date).toBe(toISODate(local))
    expect(v.time).toBe(`${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`)
  })

  it('keeps TZID / floating times as local wall-clock', () => {
    expect(parseDateValue('20261022T093000', { TZID: 'Asia/Kolkata' })).toEqual({ date: '2026-10-22', time: '09:30' })
  })
})

describe('parseIcs', () => {
  it('parses an all-day event with exclusive DTEND', () => {
    const r = parseIcs(
      wrap(
        ['BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Trip\\, Goa', 'DTSTART;VALUE=DATE:20261101', 'DTEND;VALUE=DATE:20261104', 'END:VEVENT'].join('\r\n'),
        'X-WR-CALNAME:Personal',
      ),
      W,
    )
    expect(r.calendarName).toBe('Personal')
    expect(r.events).toHaveLength(1)
    expect(r.events[0]).toMatchObject({ title: 'Trip, Goa', date: '2026-11-01', endDate: '2026-11-03', allDay: true, externalId: 'a1' })
  })

  it('single-day all-day event has no endDate', () => {
    const r = parseIcs(wrap('BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261225\r\nDTEND;VALUE=DATE:20261226\r\nEND:VEVENT'), W)
    expect(r.events[0].endDate).toBeNull()
  })

  it('parses timed event with DURATION and ignores VALARM content', () => {
    const r = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:c',
          'SUMMARY:Standup',
          'DTSTART;TZID=Asia/Kolkata:20261022T100000',
          'DURATION:PT15M',
          'BEGIN:VALARM',
          'SUMMARY:Alarm text',
          'END:VALARM',
          'LOCATION:Room 4',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      W,
    )
    expect(r.events[0]).toMatchObject({ title: 'Standup', startTime: '10:00', endTime: '10:15', location: 'Room 4', allDay: false })
  })

  it('expands weekly BYDAY with COUNT and EXDATE', () => {
    const r = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:w',
          'SUMMARY:Gym',
          'DTSTART:20261005T070000',
          'DTEND:20261005T080000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4',
          'EXDATE:20261007T070000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      W,
    )
    // Oct 5 (Mon), 7 (Wed, excluded), 12 (Mon), 14 (Wed)
    expect(r.events.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-14'])
    expect(r.events[0].externalId).toBe('w:2026-10-05')
  })

  it('applies RECURRENCE-ID overrides', () => {
    const r = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:r',
          'SUMMARY:Class',
          'DTSTART;VALUE=DATE:20261001',
          'RRULE:FREQ=DAILY;COUNT=3',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:r',
          'RECURRENCE-ID;VALUE=DATE:20261002',
          'SUMMARY:Class (moved)',
          'DTSTART;VALUE=DATE:20261005',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      W,
    )
    const ids = r.events.map((e) => `${e.externalId}|${e.date}|${e.title}`).sort()
    expect(ids).toEqual(['r:2026-10-01|2026-10-01|Class', 'r:2026-10-02|2026-10-05|Class (moved)', 'r:2026-10-03|2026-10-03|Class'])
  })

  it('skips cancelled events and rejects non-ics text', () => {
    const r = parseIcs(wrap('BEGIN:VEVENT\r\nUID:x\r\nSTATUS:CANCELLED\r\nDTSTART;VALUE=DATE:20261001\r\nEND:VEVENT'), W)
    expect(r.events).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(() => parseIcs('hello')).toThrow()
  })
})

describe('expandRule', () => {
  it('monthly nth weekday (last Friday)', () => {
    const rule = parseRRule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3')!
    expect(expandRule(rule, '2026-10-30', '2026-01-01', '2027-12-31')).toEqual(['2026-10-30', '2026-11-27', '2026-12-25'])
  })

  it('yearly respects UNTIL and window', () => {
    const rule = parseRRule('FREQ=YEARLY;UNTIL=20281231')!
    expect(expandRule(rule, '2020-03-15', '2026-01-01', '2030-01-01')).toEqual(['2026-03-15', '2027-03-15', '2028-03-15'])
  })

  it('daily interval and max cap', () => {
    const rule = parseRRule('FREQ=DAILY;INTERVAL=2')!
    expect(expandRule(rule, '2026-10-01', '2026-10-01', '2026-10-09')).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09'])
    expect(expandRule(parseRRule('FREQ=DAILY')!, '2026-01-01', '2026-01-01', '2027-12-31', 10)).toHaveLength(10)
  })
})
