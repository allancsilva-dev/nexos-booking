import { Injectable, Inject } from "@nestjs/common";
import { Resend } from "resend";
import { randomUUID } from "node:crypto";

import { ScrubbedLogger } from "../../common/logger/scrubbed-logger.service";
import type { NotificationSender } from "./notification-sender.interface";

@Injectable()
export class ResendSender implements NotificationSender {
  private readonly resend: Resend | null = null;
  private readonly from: string;

  constructor(
    @Inject(ScrubbedLogger) private readonly logger: ScrubbedLogger,
  ) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn("RESEND_API_KEY not set — notification sending will fallback to structured log");
      this.from = process.env.RESEND_FROM ?? "noreply@nexos.app";
      return;
    }
    this.resend = new Resend(apiKey);
    this.from = process.env.RESEND_FROM ?? "noreply@nexos.app";
  }

  async send(
    channel: string,
    template: string,
    to: string,
    vars: Record<string, string>,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        JSON.stringify({
          channel,
          template,
          status: "fallback",
        }),
      );
      return;
    }

    const requestId = randomUUID();

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (channel === "email") {
          await this.resend.emails.send({
            from: this.from,
            to,
            subject: this.subjectFor(template),
            html: this.renderHtml(template, vars),
          });
        }
        return;
      } catch {
        if (attempt === 3) {
          this.logger.error(
            JSON.stringify({
              channel,
              template,
              requestId,
              status: "fallback",
            }),
          );
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100),
        );
      }
    }
  }

  private subjectFor(template: string): string {
    switch (template) {
      case "verify-email":
        return "Verify your email address";
      case "password-reset":
        return "Reset your password";
      case "invitation":
        return "You've been invited to join an organization";
      default:
        return "Notification from Nexos";
    }
  }

  private renderHtml(
    template: string,
    vars: Record<string, string>,
  ): string {
    switch (template) {
      case "verify-email":
        return `<p>Hello ${vars.name ?? "there"},</p><p>Please verify your email by clicking the link below:</p><p><a href="${vars.link ?? "#"}">Verify Email</a></p><p>This link expires in 24 hours.</p>`;
      case "password-reset":
        return `<p>Hello,</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${vars.link ?? "#"}">Reset Password</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>`;
      case "invitation":
        return `<p>Hello,</p><p>${vars.inviterName ?? "Someone"} has invited you to join <strong>${vars.orgName ?? "an organization"}</strong>.</p><p>Click the link below to accept the invitation:</p><p><a href="${vars.link ?? "#"}">Accept Invitation</a></p><p>This invitation expires in 7 days.</p>`;
      default:
        return `<p>${vars.message ?? ""}</p>`;
    }
  }
}
