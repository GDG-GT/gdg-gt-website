import { api } from "@/lib/api";
import type { Board, BoardDocument, OpenBoard } from "@/ui/whiteboards/types";
export type Whiteboard = Board;
const path = "/admin/whiteboards";
export class WhiteboardService {
  static list(query = "") {
    return api<{ items: Board[]; total: number; pageSize: number }>(
      path + query,
    );
  }
  static get(id: string) {
    return api<OpenBoard>(path + "/" + id);
  }
  static create(record: { name: string; teamId: string | null }, key: string) {
    return api<{ record: Board }>(path, {
      method: "POST",
      protected: true,
      idempotencyKey: key,
      body: record,
    });
  }
  static mutate(
    record: Board,
    action: string,
    document: Record<string, unknown>,
    key: string,
  ) {
    return api<{ record: Board }>(path + "/" + record.id, {
      method: "POST",
      protected: true,
      idempotencyKey: key,
      body: {
        action,
        version: record.version,
        updatedAt: record.updated_at,
        ...document,
      },
    });
  }
  static saveDocument(record: Board, document: BoardDocument, key: string) {
    return this.mutate(record, "save", { document }, key);
  }
  static rename(record: Board, name: string, key: string) {
    return this.mutate(record, "rename", { name }, key);
  }
  static archive(record: Board, key: string) {
    return this.mutate(record, "archive", { confirmation: record.name }, key);
  }
  static restore(record: Board, key: string) {
    return this.mutate(record, "restore", { confirmation: record.name }, key);
  }
}
export default WhiteboardService;
