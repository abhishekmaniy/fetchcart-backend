import {
  redisSubscriber,
} from "../config/redis";

import {
  COMPARE_EVENTS_CHANNEL,
} from "./compare-event.publisher";

import { broadcastCompareEvent } from "../websocket/ws.server";

import { CompareSocketEvent } from "../types/compare.types";

export function startCompareEventSubscriber() {
  redisSubscriber.subscribe(COMPARE_EVENTS_CHANNEL, (error) => {
    if (error) {
      console.error("Redis compare subscribe error:", error);
      return;
    }

    console.log(`📡 Subscribed to ${COMPARE_EVENTS_CHANNEL}`);
  });

  redisSubscriber.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message) as CompareSocketEvent;

      broadcastCompareEvent(event);
    } catch (error) {
      console.error("Invalid compare event:", error);
    }
  });
}