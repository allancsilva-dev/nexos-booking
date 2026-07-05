export interface UpdateServiceInput {
  name?: string;
  durationMin?: number;
  bufferAfterMin?: number | null;
  priceCents?: number;
  active?: boolean;
}
