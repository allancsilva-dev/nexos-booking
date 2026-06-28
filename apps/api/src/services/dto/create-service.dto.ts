export interface CreateServiceInput {
  name: string;
  durationMin: number;
  bufferAfterMin?: number | null;
  priceCents: number;
}
