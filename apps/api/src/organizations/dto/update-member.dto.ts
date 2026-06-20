export interface UpdateMemberInput {
  role?: "OWNER" | "MANAGER" | "PROFESSIONAL";
  status?: "ACTIVE" | "DISABLED";
}
