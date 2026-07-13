import { HttpException, HttpStatus } from "@nestjs/common";

export class DependencyUnavailableException extends HttpException {
  constructor(dependency: string) {
    super(
      {
        code: "DEPENDENCY_UNAVAILABLE",
        message: `${dependency} is temporarily unavailable`,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
