import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { verifyToken } from "./auth";

interface WSClient {
  ws: WebSocket;
  userId: string;
  topics: Set<string>;
}

const clients = new Set<WSClient>();
let wss: WebSocketServer | null = null;

function extractToken(req: IncomingMessage): string | null {
  const cookie = req.headers.cookie;
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const t = url.searchParams.get("token");
    if (t) return t;
  } catch {}
  return null;
}

export function initWSS(server: Server): void {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const token = extractToken(req);
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const client: WSClient = { ws, userId: payload.userId, topics: new Set() };
    clients.add(client);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; topics?: unknown };
        if ((msg.type === "subscribe" || msg.type === "unsubscribe") && Array.isArray(msg.topics)) {
          for (const t of msg.topics as string[]) {
            if (msg.type === "subscribe") client.topics.add(t);
            else client.topics.delete(t);
          }
        }
      } catch {}
    });

    ws.on("close", () => clients.delete(client));
    ws.on("error", () => { try { ws.close(); } catch {} clients.delete(client); });

    try {
      ws.send(JSON.stringify({ type: "connected", userId: payload.userId }));
    } catch {}
  });
}

export function broadcast(topic: string, data: unknown): void {
  if (!wss) return;
  const msg = JSON.stringify({ type: "event", topic, data });
  for (const client of clients) {
    if (client.topics.has(topic) && client.ws.readyState === WebSocket.OPEN) {
      try { client.ws.send(msg); } catch {}
    }
  }
}
