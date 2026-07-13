import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

@Injectable()
export class KickService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  kickBySid(sid: string) {
    if (!this.server) return;
    this.server.in(`session:${sid}`).disconnectSockets(true);
  }

  kickBySids(sids: string[]) {
    for (const sid of sids) {
      this.kickBySid(sid);
    }
  }
}
