import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { ERROR_CODES } from "@nexos/shared";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);
  Logger.log(
    `API base online with ${ERROR_CODES.length} contract error codes`,
    "Bootstrap",
  );
}

void bootstrap();
