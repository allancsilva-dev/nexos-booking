export interface AppointmentEventPublisher {
  publish(event: PublishedEvent): Promise<void>;
}

export interface PublishedEvent {
  appointmentId: string;
  professionalId: string;
  eventType: string;
  date: string;
  version: number;
  occurredAt: string;
  organizationId?: string;
}
