import { expect, test, type APIRequestContext } from "@playwright/test";

const apiBase = "http://localhost:3001";

function authHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "X-Request-Id": crypto.randomUUID(),
    ...extra,
  };
}

function civilDate(offsetDays: number): string {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + offsetDays)).toISOString().slice(0, 10);
}

async function createAppointment(
  request: APIRequestContext,
  token: string,
  professionalId: string,
  serviceId: string,
  date: string,
  hour: number,
  clientName: string,
) {
  const response = await request.post(`${apiBase}/api/v1/appointments`, {
    headers: authHeaders(token, { "Idempotency-Key": crypto.randomUUID() }),
    data: {
      professionalId,
      serviceId,
      startsAt: `${date}T${String(hour).padStart(2, "0")}:00:00-03:00`,
      client: { name: clientName, phone: `1199999${String(hour).padStart(4, "0")}` },
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; version: number }>;
}

test("WEB-5C operates reschedule and every terminal outcome with stable retry", async ({ page, request }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `web5c-${unique}@example.com`;
  const password = "Playwright-password-123";
  const date = civilDate(1);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const register = await request.post(`${apiBase}/api/v1/auth/register`, {
    data: { name: "WEB-5C E2E", email, password, organizationName: `WEB-5C ${unique}` },
  });
  expect(register.status()).toBe(201);
  const registration = await register.json() as { accessToken: string };
  const token = registration.accessToken;

  const professionalResponse = await request.post(`${apiBase}/api/v1/professionals`, {
    headers: authHeaders(token),
    data: { name: "Profissional WEB-5C" },
  });
  expect(professionalResponse.status()).toBe(201);
  const professional = await professionalResponse.json() as { id: string };

  const serviceResponse = await request.post(`${apiBase}/api/v1/services`, {
    headers: authHeaders(token),
    data: { name: "Serviço WEB-5C", durationMin: 30, bufferAfterMin: 0, priceCents: 5000 },
  });
  expect(serviceResponse.status()).toBe(201);
  const service = await serviceResponse.json() as { id: string };

  const link = await request.put(`${apiBase}/api/v1/professionals/${professional.id}/services`, {
    headers: authHeaders(token),
    data: { serviceIds: [service.id] },
  });
  expect(link.status()).toBe(200);
  const hours = await request.put(`${apiBase}/api/v1/professionals/${professional.id}/working-hours`, {
    headers: authHeaders(token),
    data: { shifts: [{ weekday, startTime: "08:00", endTime: "18:00" }] },
  });
  expect(hours.status()).toBe(200);

  await createAppointment(request, token, professional.id, service.id, date, 9, "Cliente Remarcar");
  await createAppointment(request, token, professional.id, service.id, date, 10, "Cliente Concluir");
  await createAppointment(request, token, professional.id, service.id, date, 11, "Cliente No Show");
  await createAppointment(request, token, professional.id, service.id, date, 12, "Cliente Cancelar");
  const realtimeAppointment = await createAppointment(
    request,
    token,
    professional.id,
    service.id,
    date,
    13,
    "Cliente Realtime",
  );
  await createAppointment(request, token, professional.id, service.id, date, 14, "Cliente Versão");
  await createAppointment(request, token, professional.id, service.id, date, 15, "Cliente Slot Conflito");

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.locator('a[title="Agenda"]').click();
  await page.getByRole("button", { name: "Próximo período" }).click();

  const openDetails = async (clientName: string) => {
    await page.getByRole("button", { name: `Abrir detalhes de ${clientName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Detalhes do agendamento" });
    await expect(dialog).toBeVisible();
    return dialog;
  };

  let firstKey: string | undefined;
  let secondKey: string | undefined;
  let patchAttempt = 0;
  await page.route("**/api/v1/appointments/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patchAttempt += 1;
    const key = route.request().headers()["idempotency-key"];
    if (patchAttempt === 1) {
      firstKey = key;
      return route.abort("connectionfailed");
    }
    secondKey = key;
    return route.continue();
  });

  let dialog = await openDetails("Cliente Remarcar");
  await dialog.getByRole("button", { name: "Remarcar" }).click();
  await dialog.getByRole("textbox", { name: "Observação" }).fill("Retry estável WEB-5C");
  await dialog.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível salvar");
  await dialog.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByText("Observação atualizada")).toBeVisible();
  expect(firstKey).toBeTruthy();
  expect(secondKey).toBe(firstKey);
  await page.unroute("**/api/v1/appointments/**");

  await dialog.getByRole("button", { name: "Remarcar" }).click();
  await dialog.getByRole("button", { name: /Selecionar horário/u }).first().click();
  await dialog.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByText("Agendamento remarcado")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();

  dialog = await openDetails("Cliente Concluir");
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog.getByText("Agendamento encerrado. Nenhuma ação disponível.")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();

  dialog = await openDetails("Cliente No Show");
  await dialog.getByRole("button", { name: "Não compareceu" }).click();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog.getByText("Agendamento encerrado. Nenhuma ação disponível.")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();

  dialog = await openDetails("Cliente Cancelar");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog.getByText("Agendamento encerrado. Nenhuma ação disponível.")).toBeVisible();

  const secondPage = await page.context().newPage();
  await secondPage.goto("/schedule");
  await secondPage.getByRole("button", { name: "Próximo período" }).click();
  const realtimeCard = secondPage.getByRole("button", { name: "Abrir detalhes de Cliente Realtime" });
  await expect(realtimeCard).toContainText("Confirmado");

  const completeRealtime = await request.post(
    `${apiBase}/api/v1/appointments/${realtimeAppointment.id}/complete`,
    {
      headers: authHeaders(token, {
        "If-Match": String(realtimeAppointment.version),
        "Idempotency-Key": crypto.randomUUID(),
      }),
    },
  );
  expect(completeRealtime.status()).toBe(200);
  await expect(realtimeCard).toContainText("Concluído", { timeout: 5_000 });

  await page.bringToFront();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  dialog = await openDetails("Cliente Versão");
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await page.route("**/api/v1/appointments/*/complete", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "if-match": "0" },
    });
  }, { times: 1 });
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("mudou em outra tela");
  await dialog.getByRole("button", { name: "Fechar" }).click();

  dialog = await openDetails("Cliente Slot Conflito");
  await dialog.getByRole("button", { name: "Remarcar" }).click();
  const conflictSlot = dialog.getByRole("button", { name: /Selecionar horário/u }).first();
  const conflictStartsAt = await conflictSlot.getAttribute("data-starts-at");
  expect(conflictStartsAt).toBeTruthy();
  await conflictSlot.click();
  await page.route("**/api/v1/appointments/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const competitor = await request.post(`${apiBase}/api/v1/appointments`, {
      headers: authHeaders(token, { "Idempotency-Key": crypto.randomUUID() }),
      data: {
        professionalId: professional.id,
        serviceId: service.id,
        startsAt: conflictStartsAt,
        client: { name: "Cliente Concorrente", phone: "11988887777" },
      },
    });
    expect(competitor.status()).toBe(201);
    await route.continue();
  }, { times: 1 });
  await dialog.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(dialog.getByRole("alert")).toContainText("ficou indisponível");
});
