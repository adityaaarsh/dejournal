import { db } from '@/db/db'
import type { StudySession } from '@/db/types'
import { nowISO, uid } from '@/lib/id'
import { undoToast } from '@/stores/ui'

export type StudySessionInput = Omit<StudySession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function createStudySession(input: StudySessionInput): Promise<StudySession> {
  return db.transaction('rw', db.studySessions, async () => {
    // An explicit id (e.g. from a focus session) makes this idempotent.
    if (input.id) {
      const existing = await db.studySessions.get(input.id)
      if (existing) return existing
    }
    const now = nowISO()
    const rec: StudySession = { ...input, id: input.id ?? uid(), createdAt: now, updatedAt: now }
    await db.studySessions.add(rec)
    return rec
  })
}

export async function updateStudySession(id: string, patch: Partial<StudySession>): Promise<void> {
  await db.studySessions.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteStudySession(id: string): Promise<void> {
  const rec = await db.studySessions.get(id)
  if (!rec) return
  await db.studySessions.delete(id)
  undoToast('Study session deleted', async () => {
    await db.studySessions.put(rec)
  })
}
