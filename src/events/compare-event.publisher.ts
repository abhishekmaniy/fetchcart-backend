import { redisPublisher } from "../config/redis";

import { CompareSocketEvent } from "../types/compare.types";

export const COMPARE_EVENTS_CHANNEL = "compare-events";

export async function publishCompareEvent(
  event: CompareSocketEvent
) {
  const payload: CompareSocketEvent = {
    ...event,
    createdAt: new Date().toISOString(),
  };

  await redisPublisher.publish(
    COMPARE_EVENTS_CHANNEL,
    JSON.stringify(payload)
  );
}