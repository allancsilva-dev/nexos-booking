export class IdempotencyKeyState {
  private current: string | null = null;

  get(): string {
    this.current ??= crypto.randomUUID();
    return this.current;
  }

  reset(): void {
    this.current = null;
  }
}
