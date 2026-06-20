export interface InviteMemberInput {
  email: string;
  role: "OWNER" | "MANAGER" | "PROFESSIONAL";
}
