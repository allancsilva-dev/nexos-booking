import { Module, forwardRef } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { BillingController } from "./billing.controller";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { BillingWebhookWorker } from "./billing-webhook.worker";
import { AsaasProvider } from "./asaas.provider";
import { SubscriptionAccessInterceptor } from "./subscription-access.interceptor";

@Module({
  imports: [forwardRef(() => AuthModule), AuthorizationModule],
  controllers: [BillingController],
  providers: [
    BillingRepository, BillingService, BillingWebhookWorker, AsaasProvider,
    { provide: APP_INTERCEPTOR, useClass: SubscriptionAccessInterceptor },
  ],
  exports: [BillingService],
})
export class BillingModule {}
