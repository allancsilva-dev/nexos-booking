export interface NotificationSender {
  send(channel: string, template: string, to: string, vars: Record<string, string>): Promise<void>;
}
