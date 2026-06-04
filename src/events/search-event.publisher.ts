import { redisPublisher } from "../config/redis";

import type { SearchSocketEvent } from "../types/ws.types";

export const SEARCH_EVENTS_CHANNEL = "search-events";

export async function publishSearchEvent(
  event: SearchSocketEvent
) {
  const payload: SearchSocketEvent = {
    ...event,
    createdAt: new Date().toISOString(),
  };

  await redisPublisher.publish(
    SEARCH_EVENTS_CHANNEL,
    JSON.stringify(payload)
  );
}