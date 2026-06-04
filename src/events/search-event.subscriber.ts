import {
  redisSubscriber,
} from "../config/redis";

import {
  SEARCH_EVENTS_CHANNEL,
} from "./search-event.publisher";

import { broadcastSearchEvent } from "../websocket/ws.server";

import type { SearchSocketEvent } from "../types/ws.types";

export function startSearchEventSubscriber() {
  redisSubscriber.subscribe(SEARCH_EVENTS_CHANNEL, (error) => {
    if (error) {
      console.error("Redis subscribe error:", error);
      return;
    }

    console.log(`📡 Subscribed to ${SEARCH_EVENTS_CHANNEL}`);
  });

  redisSubscriber.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message) as SearchSocketEvent;

      broadcastSearchEvent(event);
    } catch (error) {
      console.error("Invalid search event:", error);
    }
  });
}