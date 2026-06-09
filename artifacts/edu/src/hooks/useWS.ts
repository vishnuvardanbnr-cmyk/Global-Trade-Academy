import { useEffect, useRef } from "react";

type Handler = (data: unknown) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2000;
const topicHandlers = new Map<string, Set<Handler>>();

function getWSUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

function connectWS(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  socket = new WebSocket(getWSUrl());

  socket.onopen = () => {
    reconnectDelay = 2000;
    const topics = Array.from(topicHandlers.keys());
    if (topics.length && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "subscribe", topics }));
    }
  };

  socket.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data as string) as {
        type: string;
        topic?: string;
        data?: unknown;
      };
      if (msg.type === "event" && msg.topic) {
        topicHandlers.get(msg.topic)?.forEach((h) => {
          try {
            h(msg.data);
          } catch {}
        });
      }
    } catch {}
  };

  socket.onclose = () => {
    socket = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
      connectWS();
    }, reconnectDelay);
  };

  socket.onerror = () => {
    try {
      socket?.close();
    } catch {}
  };
}

export function useWS(topic: string, handler: Handler): void {
  const handlerRef = useRef<Handler>(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable: Handler = (data) => handlerRef.current(data);

    if (!topicHandlers.has(topic)) {
      topicHandlers.set(topic, new Set());
    }
    topicHandlers.get(topic)!.add(stable);

    connectWS();

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "subscribe", topics: [topic] }));
    }

    return () => {
      const handlers = topicHandlers.get(topic);
      if (handlers) {
        handlers.delete(stable);
        if (handlers.size === 0) {
          topicHandlers.delete(topic);
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({ type: "unsubscribe", topics: [topic] }),
            );
          }
        }
      }
    };
  }, [topic]);
}
