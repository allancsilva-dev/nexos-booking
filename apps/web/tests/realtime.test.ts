import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { AppointmentChangedEventSchema } from "@nexos/shared";

import { invalidateAppointmentEvent } from "../components/realtime/query-invalidation";
import { refreshAccessToken } from "../lib/session-refresh";
import { useAuthStore } from "../stores/auth-store";

async function main(): Promise<void> {
const event = AppointmentChangedEventSchema.parse({
  appointmentId: "11111111-1111-4111-8111-111111111111",
  professionalId: "22222222-2222-4222-8222-222222222222",
  eventType: "RESCHEDULED",
  date: "2026-07-13",
  version: 2,
  occurredAt: "2026-07-13T12:00:00.000Z",
});
assert.equal(AppointmentChangedEventSchema.safeParse({ ...event, clientName: "PII" }).success, false);

const organizationId = "33333333-3333-4333-8333-333333333333";
const queryClient = new QueryClient();
const keys = [
  ["appointments", organizationId],
  ["appointment-detail", organizationId, event.appointmentId],
  ["availability", organizationId],
  ["dashboard-overview", organizationId],
  ["clients", organizationId],
  ["client-detail", organizationId],
];
for (const key of keys) queryClient.setQueryData(key, { cached: true });
invalidateAppointmentEvent(queryClient, organizationId, event);
for (const key of keys) {
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true, `query ${key[0]} must invalidate`);
}

let refreshCalls = 0;
globalThis.fetch = async () => {
  refreshCalls += 1;
  await new Promise((resolve) => setTimeout(resolve, 10));
  return new Response(JSON.stringify({ accessToken: "fresh-token" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
const [first, second] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);
assert.equal(refreshCalls, 1, "refresh must be single-flight");
assert.equal(first.token, "fresh-token");
assert.equal(second.token, "fresh-token");
assert.equal(useAuthStore.getState().accessToken, "fresh-token");

console.log("Realtime contract, invalidation and refresh single-flight: PASS");
}

void main();
