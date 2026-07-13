import { expect, test } from "@playwright/test";

const apiBase = "http://localhost:3001";
const password = "Playwright-password-123";
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `web-e2e-${unique}@example.com`;

test("authenticated MVP navigation and professional hours work by click", async ({ page, request }) => {
  const register = await request.post(`${apiBase}/api/v1/auth/register`, {
    data: {
      name: "Web E2E",
      email,
      password,
      organizationName: `E2E ${unique}`,
    },
  });
  expect(register.status()).toBe(201);
  const registration = await register.json();
  const token = registration.accessToken as string;

  const professional = await request.post(`${apiBase}/api/v1/professionals`, {
    headers: { Authorization: `Bearer ${token}`, "X-Request-Id": crypto.randomUUID() },
    data: { name: "Profissional E2E" },
  });
  expect(professional.status()).toBe(201);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);

  await page.locator('a[title="Agenda"]').click();
  await expect(page).toHaveURL(/\/schedule$/u);

  await page.locator('a[title="Profissionais"]').click();
  await expect(page).toHaveURL(/\/professionals$/u);
  const journey = page.getByRole("link", { name: /Jornada/u }).first();
  await expect(journey).toBeVisible();
  await journey.click();
  await expect(page).toHaveURL(/\/professionals\/[^/]+\/hours$/u);

  await page.locator('a[title="Configurações"]').click();
  await expect(page).toHaveURL(/\/settings\/organization$/u);
});
