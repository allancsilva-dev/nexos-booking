import { Injectable, LoggerService, LogLevel } from "@nestjs/common";

import { scrub } from "./scrub";

@Injectable()
export class ScrubbedLogger implements LoggerService {
  log(message: string, ...optionalParams: unknown[]) {
    console.log(message, ...optionalParams.map((p) => scrub(p)));
  }

  error(message: string, ...optionalParams: unknown[]) {
    console.error(message, ...optionalParams.map((p) => scrub(p)));
  }

  warn(message: string, ...optionalParams: unknown[]) {
    console.warn(message, ...optionalParams.map((p) => scrub(p)));
  }

  debug(message: string, ...optionalParams: unknown[]) {
    console.debug(message, ...optionalParams.map((p) => scrub(p)));
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    console.log(message, ...optionalParams.map((p) => scrub(p)));
  }

  fatal(message: string, ...optionalParams: unknown[]) {
    console.error(message, ...optionalParams.map((p) => scrub(p)));
  }

  setLogLevels(levels: LogLevel[]) {
    void levels; // Log levels are controlled by NestJS defaults
  }
}
