import "reflect-metadata";

import assert from "node:assert/strict";

import { HttpStatus } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants.js";

import { AuthController } from "../dist/src/auth/auth.controller.js";
import { CsrfGuard } from "../dist/src/auth/guards/csrf.guard.js";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";
const REFRESH_TTL_MS = 30 * 86400_000;

function makeAuthService() {
  return {
    async register() {
      return {
        user: { id: "user-1", email: "dev@example.com" },
        organization: { id: "org-1", name: "Dev Org" },
        accessToken: "access-register",
        refreshToken: "refresh-register",
      };
    },
    async login() {
      return {
        user: { id: "user-1", email: "dev@example.com" },
        activeOrg: "org-1",
        accessToken: "access-login",
        refreshToken: "refresh-login",
      };
    },
    async refresh() {
      return {
        user: { id: "user-1", email: "dev@example.com" },
        activeOrg: "org-1",
        accessToken: "access-refresh",
        refreshToken: "refresh-rotated",
      };
    },
    async logout() {},
  };
}

function makeResponse() {
  return {
    cookies: [],
    clearedCookies: [],
    statusCode: null,
    jsonBody: null,
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

function makeRequest(headers = {}) {
  return {
    headers,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function makeExecutionContext(req) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return req;
        },
      };
    },
  };
}

function normalizeCookie(entry) {
  return {
    name: entry.name,
    httpOnly: entry.options.httpOnly,
    secure: entry.options.secure,
    sameSite: entry.options.sameSite,
    path: entry.options.path,
    maxAge: entry.options.maxAge ?? null,
  };
}

async function main() {
  const controller = new AuthController(makeAuthService());
  const csrfGuard = new CsrfGuard();
  const httpCode = Reflect.getMetadata(
    HTTP_CODE_METADATA,
    AuthController.prototype.logout,
  );

  const registerBody = {
    name: "Dev User",
    email: "dev@example.com",
    password: "password123",
    organizationName: "Dev Org",
  };
  const loginBody = {
    email: "dev@example.com",
    password: "password123",
  };

  process.env.NODE_ENV = "development";

  const devRegisterRes = makeResponse();
  await controller.register(registerBody, makeRequest(), devRegisterRes);
  const devRegisterCookie = normalizeCookie(devRegisterRes.cookies[0]);

  assert.equal(devRegisterCookie.name, REFRESH_COOKIE);
  assert.equal(devRegisterCookie.httpOnly, true);
  assert.equal(devRegisterCookie.secure, false);
  assert.equal(devRegisterCookie.sameSite, "strict");
  assert.equal(devRegisterCookie.path, REFRESH_COOKIE_PATH);
  assert.equal(devRegisterCookie.maxAge, REFRESH_TTL_MS);

  const devLoginRes = makeResponse();
  await controller.login(loginBody, makeRequest(), devLoginRes);
  const devLoginCookie = normalizeCookie(devLoginRes.cookies[0]);

  assert.equal(devLoginCookie.secure, false);
  assert.equal(devLoginCookie.httpOnly, true);
  assert.equal(devLoginCookie.sameSite, "strict");
  assert.equal(devLoginCookie.path, REFRESH_COOKIE_PATH);

  const devRefreshReq = makeRequest({
    cookie: `${REFRESH_COOKIE}=refresh-login`,
    "x-csrf": "1",
    "user-agent": "smoke-test",
  });
  assert.equal(
    csrfGuard.canActivate(makeExecutionContext(devRefreshReq)),
    true,
  );

  const devRefreshRes = makeResponse();
  const devRefreshBody = await controller.refresh(devRefreshReq, devRefreshRes);
  const devRefreshCookie = normalizeCookie(devRefreshRes.cookies[0]);

  assert.equal(devRefreshBody.accessToken, "access-refresh");
  assert.equal(devRefreshCookie.secure, false);
  assert.equal(devRefreshCookie.httpOnly, true);
  assert.equal(devRefreshCookie.sameSite, "strict");
  assert.equal(devRefreshCookie.path, REFRESH_COOKIE_PATH);

  const missingCsrfReq = makeRequest({
    cookie: `${REFRESH_COOKIE}=refresh-login`,
  });
  let missingCsrfStatus = null;
  try {
    csrfGuard.canActivate(makeExecutionContext(missingCsrfReq));
  } catch (error) {
    missingCsrfStatus = error.getStatus?.() ?? null;
  }
  assert.equal(missingCsrfStatus, HttpStatus.FORBIDDEN);

  const logoutRes = makeResponse();
  await controller.logout(
    { accessPayload: { sub: "user-1", sid: "session-1", org: "org-1" } },
    logoutRes,
  );
  const logoutCookie = normalizeCookie(logoutRes.clearedCookies[0]);

  assert.equal(httpCode, HttpStatus.NO_CONTENT);
  assert.equal(logoutCookie.secure, false);
  assert.equal(logoutCookie.httpOnly, true);
  assert.equal(logoutCookie.sameSite, "strict");
  assert.equal(logoutCookie.path, REFRESH_COOKIE_PATH);
  assert.equal(logoutCookie.maxAge, null);

  process.env.NODE_ENV = "production";

  const prodLoginRes = makeResponse();
  await controller.login(loginBody, makeRequest(), prodLoginRes);
  const prodLoginCookie = normalizeCookie(prodLoginRes.cookies[0]);

  assert.equal(prodLoginCookie.secure, true);
  assert.equal(prodLoginCookie.httpOnly, true);
  assert.equal(prodLoginCookie.sameSite, "strict");
  assert.equal(prodLoginCookie.path, REFRESH_COOKIE_PATH);

  console.log(
    JSON.stringify(
      {
        proof: "refresh-cookie-controller-smoke",
        development: {
          registerSetCookie: devRegisterCookie,
          loginSetCookie: devLoginCookie,
          refreshStatus: 200,
          refreshSetCookie: devRefreshCookie,
          refreshWithoutCsrfStatus: missingCsrfStatus,
          logoutStatus: httpCode,
          logoutClearCookie: logoutCookie,
        },
        production: {
          loginSetCookie: prodLoginCookie,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
