import type { NextConfig } from "next";

const internalApiBaseUrl =
  process.env.NEXT_INTERNAL_API_BASE_URL ?? "http://localhost:3001";

// CSP em modo Report-Only: o App Router emite <script> inline
// (self.__next_f.push) e uma politica impositiva com script-src 'self'
// quebraria a hidratacao inteira. Report-Only observa as violacoes sem
// bloquear; migrar para impositiva exige nonce por request via middleware.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // websocket do socket.io (mesma origem; wss explicito como garantia)
  "connect-src 'self' wss://booking.nexostech.com.br",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Mesmo max-age do Helmet na API, para as duas camadas nao divergirem.
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  // Remove o header x-powered-by: Next.js (vazamento de stack).
  poweredByHeader: false,
  async headers() {
    return [
      {
        // O negative lookahead e essencial: o nginx-proxy-manager encaminha
        // tudo menos /socket.io para o container web, entao /api/v1/* chega
        // a API pelo rewrite abaixo. Sem excluir /api/, estes headers seriam
        // carimbados tambem nas respostas da API, sobrepondo uma segunda CSP
        // a do Helmet (default-src 'none').
        source: "/((?!api/).*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
