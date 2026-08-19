import { z } from 'zod'
import { oc } from '@orpc/contract'

export const NoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  sourceUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Note = z.infer<typeof NoteSchema>

export const noteContract = {
  list: oc
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(z.array(NoteSchema)),

  get: oc
    .input(z.object({ id: z.string() }))
    .output(NoteSchema),

  create: oc
    .input(
      z.object({
        content: z.string().min(1),
        sourceUrl: z.string().url().optional(),
      }),
    )
    .output(NoteSchema),

  update: oc
    .input(
      z.object({
        id: z.string(),
        content: z.string().min(1),
      }),
    )
    .output(NoteSchema),

  delete: oc
    .input(z.object({ id: z.string() }))
    .output(z.void()),
}

export const appContract = {
  note: noteContract,
}

export type AppContract = typeof appContract
