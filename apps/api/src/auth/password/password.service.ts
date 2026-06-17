import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: 2,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return verify(hash, password);
  }
}
