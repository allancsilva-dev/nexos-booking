"use client";

import { createContext, useContext } from "react";
import type { MeResponse } from "@/lib/auth-schemas";

type BootstrapStatus = "loading" | "authenticated" | "idle" | "error";

export interface BootstrapResult {
  status: BootstrapStatus;
  user?: MeResponse["user"];
  memberships?: MeResponse["memberships"];
  error?: string;
}

// -------------------------------------------------------------------
// ADR-020 / PR-BUGFIX-1 (defeito B1):
//
// O contexto expõe `refreshSession` em vez de `setResult` cru.
// Mutations (login/register) NÃO sintetizam estado — apenas chamam
// `refreshSession(token)` e a promoção ocorre DENTRO dela, via
// GET /auth/me, seguindo ADR-020.
//
// `setResult` permanece INTERNO ao AuthBootstrap (providers.tsx) e
// nunca é publicado para consumidores externos.
// -------------------------------------------------------------------

/** Shape interno do contexto — expõe resultado + refreshSession. */
export interface AuthBootstrapCtxValue {
  result: BootstrapResult;
  /**
   * Recompõe a sessão a partir de um access token válido, chamando
   * GET /auth/me (e opcionalmente POST /auth/switch-org).
   * É a origem única de promoção para `authenticated` ou `idle`.
   */
  refreshSession: (token: string) => Promise<void>;
}

/**
 * Valor inicial do contexto. `refreshSession` é um no-op seguro para
 * o caso improvável de um consumidor ser montado fora do AuthBootstrap.
 */
export const AuthBootstrapContext = createContext<AuthBootstrapCtxValue>({
  result: { status: "loading" },
  // no-op seguro: consumidor fora do AuthBootstrap (não ocorre em runtime normal)
  refreshSession: async () => {},
});

/**
 * Hook público para consumidores que só precisam ler o estado de
 * sessão (auth-guard, header, etc.). Retorna BootstrapResult
 * diretamente — assinatura inalterada, nenhum consumidor existente
 * precisa ser atualizado.
 */
export function useAuthBootstrap(): BootstrapResult {
  return useContext(AuthBootstrapContext).result;
}

/**
 * Hook para mutations (login, register) que precisam recompor a
 * sessão após obter um novo access token.
 *
 * Retorna `refreshSession(token)` — a função chama GET /auth/me
 * internamente e é a única origem de promoção para authenticated/idle.
 *
 * Uso exclusivo em mutations de auth. Não usar para leitura de estado.
 */
export function useRefreshSession(): (token: string) => Promise<void> {
  return useContext(AuthBootstrapContext).refreshSession;
}
