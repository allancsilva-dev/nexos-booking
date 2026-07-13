import type { QueryClient } from "@tanstack/react-query";
import type { AppointmentChangedEvent } from "@nexos/shared";

export function invalidateAppointmentEvent(
  queryClient: QueryClient,
  organizationId: string,
  event: AppointmentChangedEvent,
): void {
  const keys: ReadonlyArray<readonly unknown[]> = [
    ["appointments", organizationId],
    ["appointment-detail", organizationId, event.appointmentId],
    ["availability", organizationId],
    ["dashboard-overview", organizationId],
    ["clients", organizationId],
    ["client-detail", organizationId],
  ];
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
