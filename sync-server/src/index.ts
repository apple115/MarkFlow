/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';

type Env = {
  KV: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();

// --- KV Snapshot API ---

// Get latest encrypted snapshot for a room
app.get('/room/:roomId/snapshot', async (c) => {
  const { roomId } = c.req.param();
  const data = await c.env.KV.get(`room:${roomId}:snapshot`, 'arrayBuffer');
  if (!data) {
    return c.json({ error: 'no snapshot' }, 404);
  }
  return new Response(data, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
});

// Upload encrypted snapshot
app.put('/room/:roomId/snapshot', async (c) => {
  const { roomId } = c.req.param();
  const body = await c.req.arrayBuffer();
  // TTL 30 days
  await c.env.KV.put(`room:${roomId}:snapshot`, body, { expirationTtl: 30 * 24 * 3600 });
  return c.json({ ok: true });
});

// --- WebSocket Signaling ---

// Track connected peers per room
const rooms = new Map<string, Set<WebSocket>>();

function getRoom(roomId: string): Set<WebSocket> {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Set();
    rooms.set(roomId, room);
  }
  return room;
}

app.get('/room/:roomId/signaling', (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket', 400);
  }

  const { roomId } = c.req.param();
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  const room = getRoom(roomId);

  server.accept();
  room.add(server);

  // Forward messages to other peers in the room
  server.addEventListener('message', (event) => {
    for (const peer of room) {
      if (peer !== server && peer.readyState === WebSocket.READY_STATE_OPEN) {
        peer.send(event.data as string);
      }
    }
  });

  server.addEventListener('close', () => {
    room.delete(server);
    const leave = JSON.stringify({ type: 'peer-leave' });
    for (const peer of room) {
      if (peer.readyState === WebSocket.READY_STATE_OPEN) {
        peer.send(leave);
      }
    }
  });

  return new Response(null, { status: 101, webSocket: client });
});

export default app;
