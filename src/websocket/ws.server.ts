import { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";

import type { SearchSocketEvent } from "../types/ws.types";
import { CompareSocketEvent } from "../types/compare.types";

type ClientMeta = {
  userId?: string;
  subscribedSearchIds: Set<string>;
  subscribedCompareIds: Set<string>;
};

const clients = new Map<WebSocket, ClientMeta>();

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    clients.set(ws, {
      subscribedSearchIds: new Set(),
      subscribedCompareIds: new Set(),
    });

    ws.send(
      JSON.stringify({
        type: "CONNECTED",
        message: "WebSocket connected successfully",
      })
    );

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const meta = clients.get(ws);

        if (!meta) {
          ws.send(
            JSON.stringify({
              type: "WS_ERROR",
              message: "Client metadata not found",
            })
          );
          return;
        }

        if (data.type === "SUBSCRIBE_SEARCH" && data.searchId) {
          meta.subscribedSearchIds.add(data.searchId);

          ws.send(
            JSON.stringify({
              type: "SUBSCRIBED_SEARCH",
              searchId: data.searchId,
            })
          );

          return;
        }

        if (data.type === "UNSUBSCRIBE_SEARCH" && data.searchId) {
          meta.subscribedSearchIds.delete(data.searchId);

          ws.send(
            JSON.stringify({
              type: "UNSUBSCRIBED_SEARCH",
              searchId: data.searchId,
            })
          );

          return;
        }

        if (data.type === "SUBSCRIBE_COMPARE" && data.compareId) {
          meta.subscribedCompareIds.add(data.compareId);

          ws.send(
            JSON.stringify({
              type: "SUBSCRIBED_COMPARE",
              compareId: data.compareId,
            })
          );

          return;
        }

        if (data.type === "UNSUBSCRIBE_COMPARE" && data.compareId) {
          meta.subscribedCompareIds.delete(data.compareId);

          ws.send(
            JSON.stringify({
              type: "UNSUBSCRIBED_COMPARE",
              compareId: data.compareId,
            })
          );

          return;
        }

        ws.send(
          JSON.stringify({
            type: "WS_ERROR",
            message: "Unknown WebSocket message type",
          })
        );
      } catch {
        ws.send(
          JSON.stringify({
            type: "WS_ERROR",
            message: "Invalid WebSocket message",
          })
        );
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket client error:", error);
      clients.delete(ws);
    });
  });

  return wss;
}

export function broadcastSearchEvent(event: SearchSocketEvent) {
  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    if (meta.subscribedSearchIds.has(event.searchId)) {
      ws.send(JSON.stringify(event));
    }
  }
}

export function broadcastCompareEvent(event: CompareSocketEvent) {
  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    if (meta.subscribedCompareIds.has(event.compareId)) {
      ws.send(JSON.stringify(event));
    }
  }
}