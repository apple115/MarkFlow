/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { implement } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { onError } from '@orpc/server'
import { appContract, type Note } from '@markflow/contract'

type Env = {
  KV: KVNamespace
  DB: D1Database
}

type Context = {
  db: D1Database
}

const os = implement(appContract).$context<Context>()

function generateId(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

async function rowToNote(row: Record<string, unknown>): Promise<Note> {
  return {
    id: String(row.id),
    content: String(row.content),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

const listNotes = os.note.list.handler(async ({ input, context }) => {
  const limit = input.limit ?? 20
  const cursor = input.cursor

  let sql = 'SELECT * FROM notes'
  const params: (string | number)[] = []

  if (cursor) {
    sql += ' WHERE updated_at < ?'
    params.push(cursor)
  }

  sql += ' ORDER BY updated_at DESC LIMIT ?'
  params.push(limit + 1)

  const { results } = await context.db.prepare(sql).bind(...params).all<Record<string, unknown>>()
  const rows = results ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return Promise.all(page.map(rowToNote))
})

const getNote = os.note.get.handler(async ({ input, context }) => {
  const row = await context.db
    .prepare('SELECT * FROM notes WHERE id = ?')
    .bind(input.id)
    .first<Record<string, unknown>>()

  if (!row) {
    throw new Error(`Note not found: ${input.id}`)
  }

  return rowToNote(row)
})

const createNote = os.note.create.handler(async ({ input, context }) => {
  const id = generateId()
  const time = now()
  const sourceUrl = input.sourceUrl ?? null

  await context.db
    .prepare(
      'INSERT INTO notes (id, content, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(id, input.content, sourceUrl, time, time)
    .run()

  return {
    id,
    content: input.content,
    sourceUrl,
    createdAt: time,
    updatedAt: time,
  }
})

const updateNote = os.note.update.handler(async ({ input, context }) => {
  const time = now()

  const existing = await context.db
    .prepare('SELECT * FROM notes WHERE id = ?')
    .bind(input.id)
    .first<Record<string, unknown>>()

  if (!existing) {
    throw new Error(`Note not found: ${input.id}`)
  }

  await context.db
    .prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?')
    .bind(input.content, time, input.id)
    .run()

  return {
    id: input.id,
    content: input.content,
    sourceUrl: existing.source_url === null ? null : String(existing.source_url),
    createdAt: String(existing.created_at),
    updatedAt: time,
  }
})

const deleteNote = os.note.delete.handler(async ({ input, context }) => {
  await context.db.prepare('DELETE FROM notes WHERE id = ?').bind(input.id).run()
})

const router = os.router({
  note: {
    list: listNotes,
    get: getNote,
    create: createNote,
    update: updateNote,
    delete: deleteNote,
  },
})

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

const app = new Hono<{ Bindings: Env }>()

// --- oRPC Notes API ---

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context: { db: c.env.DB },
  })

  if (matched) {
    return c.newResponse(response.body, response)
  }

  await next()
})

// --- KV Snapshot API ---

app.get('/room/:roomId/snapshot', async (c) => {
  const { roomId } = c.req.param()
  const data = await c.env.KV.get(`room:${roomId}:snapshot`, 'arrayBuffer')
  if (!data) {
    return c.json({ error: 'no snapshot' }, 404)
  }
  return new Response(data, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
})

app.put('/room/:roomId/snapshot', async (c) => {
  const { roomId } = c.req.param()
  const body = await c.req.arrayBuffer()
  await c.env.KV.put(`room:${roomId}:snapshot`, body, { expirationTtl: 30 * 24 * 3600 })
  return c.json({ ok: true })
})

// --- WebSocket Signaling ---

const rooms = new Map<string, Set<WebSocket>>()

function getRoom(roomId: string): Set<WebSocket> {
  let room = rooms.get(roomId)
  if (!room) {
    room = new Set()
    rooms.set(roomId, room)
  }
  return room
}

app.get('/room/:roomId/signaling', (c) => {
  const upgradeHeader = c.req.header('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket', 400)
  }

  const { roomId } = c.req.param()
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

  const room = getRoom(roomId)

  server.accept()
  room.add(server)

  server.addEventListener('message', (event) => {
    for (const peer of room) {
      if (peer !== server && peer.readyState === WebSocket.OPEN) {
        peer.send(event.data as string)
      }
    }
  })

  server.addEventListener('close', () => {
    room.delete(server)
    const leave = JSON.stringify({ type: 'peer-leave' })
    for (const peer of room) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(leave)
      }
    }
  })

  return new Response(null, { status: 101, webSocket: client })
})

export default app
