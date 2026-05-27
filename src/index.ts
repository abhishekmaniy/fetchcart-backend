import http from "http";
import app from "./app";
import { env } from "./config/env";
import { initWebSocketServer } from "./websocket/ws.server";
import { startSearchEventSubscriber } from "./events/search-event.subscriber";
import { startCompareEventSubscriber } from "./events/compare-event.subscriber";

const server = http.createServer(app);

initWebSocketServer(server);
startSearchEventSubscriber();
startCompareEventSubscriber();

server.listen(env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  console.log(`🔌 WebSocket running on ws://localhost:${env.PORT}`);
});