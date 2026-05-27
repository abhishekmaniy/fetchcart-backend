import IORedis from "ioredis";

import { env } from "../config/env";
import {
  COMPARE_EVENTS_CHANNEL,
} from "./compare-event.publisher";
import { broadcastCompareEvent } from "../websocket/ws.server";
import { CompareSocketEvent } from "../types/compare.types";

export function startCompareEventSubscriber() {
  const subscriber = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  });

  subscriber.subscribe(COMPARE_EVENTS_CHANNEL, (error) => {
    if (error) {
      console.error("Redis compare subscribe error:", error);
      return;
    }

    console.log(`📡 Subscribed to ${COMPARE_EVENTS_CHANNEL}`);
  });

  subscriber.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message) as CompareSocketEvent;
      broadcastCompareEvent(event);
    } catch (error) {
      console.error("Invalid compare event:", error);
    }
  });
}