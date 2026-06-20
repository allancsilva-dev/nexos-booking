const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "currentpassword",
  "newpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "canceltoken",
  "invitationtoken",
  "verificationtoken",
  "phone",
  "phonenormalized",
  "phone_normalized",
  "telefone",
  "email",
  "secret",
  "apikey",
  "api_key",
  "idempotency-key",
]);

const REDACTED = "[REDACTED]";

const JWT_REGEX = /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""));
}

function looksLikeJwt(value: unknown): boolean {
  return typeof value === "string" && JWT_REGEX.test(value);
}

function looksLikePhone(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL_REGEX.test(value);
}

export function scrub(obj: unknown, depth = 0): unknown {
  if (depth > 20) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => scrub(item, depth + 1));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else if (looksLikeJwt(value)) {
        result[key] = REDACTED;
      } else if (looksLikePhone(value)) {
        result[key] = REDACTED;
      } else if (looksLikeEmail(value)) {
        result[key] = REDACTED;
      } else if (typeof value === "object" && value !== null) {
        result[key] = scrub(value, depth + 1);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return String(obj);
}
