import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { sharedStub } from "@nexos/shared";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);
  Logger.log(`API base online with ${sharedStub}`, "Bootstrap");
}

void bootstrap();
