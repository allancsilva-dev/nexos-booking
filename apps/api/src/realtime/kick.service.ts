import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

@Injectable()
export class KickService {
  private socketMap = new Map<string, Set<string>>();
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  register(sid: string, socketId: string) {
    const set = this.socketMap.get(sid);
    if (set) {
      set.add(socketId);
    } else {
      this.socketMap.set(sid, new Set([socketId]));
    }
  }

  unregister(sid: string, socketId: string) {
    const set = this.socketMap.get(sid);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.socketMap.delete(sid);
      }
    }
  }

  kickBySid(sid: string) {
    if (!this.server) return;
    const socketIds = this.socketMap.get(sid);
    if (socketIds) {
      for (const id of socketIds) {
        this.server.sockets.sockets.get(id)?.disconnect(true);
      }
      this.socketMap.delete(sid);
    }
  }

  kickBySids(sids: string[]) {
    for (const sid of sids) {
      this.kickBySid(sid);
    }
  }
}
