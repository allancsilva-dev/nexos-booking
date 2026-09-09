import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BillingService } from "./billing.service";
import { ScrubbedLogger } from "../common/logger/scrubbed-logger.service";

@Injectable()
export class BillingWebhookWorker {
  private readonly logger = new ScrubbedLogger();
  constructor(@Inject(BillingService) private readonly service: BillingService) {}

  @Cron("*/15 * * * * *")
  async run() {
    try { await this.service.processWebhookBatch(); }
    catch (error) { this.logger.error(`[billing-webhook] batch failed: ${error instanceof Error ? error.message : "unknown"}`); }
  }
}
