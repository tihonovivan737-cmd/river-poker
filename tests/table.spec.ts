import { test, expect, type Page, type Browser } from "@playwright/test";
async function guest(
  browser: Browser,
  name: string,
  url = "http://127.0.0.1:5181/poker/",
) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.getByLabel("Ваш ник").fill(name);
  return page;
}
const quick = (p: Page) =>
  p.getByRole("button", { name: "Быстрая игра" }).click();
const join = (p: Page) =>
  p.getByRole("button", { name: "Войти за стол" }).click();
const click = (p: Page, name: string | RegExp) =>
  p.getByRole("button", { name, exact: typeof name === "string" }).click();
test("private invitation, refresh, duplicate raise, showdown and payout", async ({
  browser,
}) => {
  const a = await guest(browser, "Анна");
  await click(a, "Создать комнату");
  await click(a, "Открыть стол");
  await expect(a).toHaveURL(/\/poker\/#room=/);
  const b = await guest(browser, "Игорь", a.url());
  await join(b);
  await expect(a.locator(".seatcards .card")).toHaveCount(2);
  await expect(b.locator(".seatcards .card")).toHaveCount(2);
  await expect(a.getByText("Ваш ход", { exact: true })).toBeVisible();
  await a.reload();
  await expect(a.getByText("Ваш ход", { exact: true })).toBeVisible();
  // Replay the exact Socket.IO frame on the same connection, including its turn nonce.
  await a.evaluate(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      send.call(this, data);
      if (typeof data === "string" && data.includes('"move"')) {
        send.call(this, data);
        document.body.dataset.replayed = "true";
      }
    };
  });
  await a.getByLabel("Сумма ставки").fill("40");
  const slider = a.getByRole("slider", { name: "Выбрать ставку ползунком" });
  await expect(slider).toHaveValue("40");
  await slider.press("ArrowRight");
  await expect(a.getByLabel("Сумма ставки")).toHaveValue("41");
  await slider.press("ArrowLeft");
  await click(a, "Повысить до 40");
  await expect(a.locator("body")).toHaveAttribute("data-replayed", "true");
  await expect(
    a.locator(".seat").filter({ hasText: "Анна" }).locator("> b"),
  ).toHaveText("960");
  await click(b, "Уравнять 30");
  for (let i = 0; i < 3; i++) {
    await click(b, "Чек");
    await click(a, "Чек");
  }
  await expect(a.getByText("Итог раздачи")).toBeVisible();
  await expect(a.locator(".seatcards .card")).toHaveCount(4);
  await expect(a.locator(".actionbar p")).toContainText("получает");
  const stacks = (await a.locator(".seat > b").allTextContents()).map((s) =>
    Number(s.replace(/\s/g, "")),
  );
  expect(stacks.reduce((x, y) => x + y, 0)).toBe(2000);
  await a.context().close();
  await b.context().close();
});
test("quick match, waiting arrivals, six seated at both desktop sizes", async ({
  browser,
}) => {
  const a = await guest(browser, "Алиса"),
    b = await guest(browser, "Борис");
  await quick(a);
  await expect(a).toHaveURL(/#room=/);
  await quick(b);
  await expect(b).toHaveURL(a.url());
  await expect(a.getByText("Ваш ход", { exact: true })).toBeVisible();
  const others: Page[] = [];
  for (const name of ["Вера", "Глеб", "Дина", "Егор"]) {
    const p = await guest(browser, name, a.url());
    await join(p);
    others.push(p);
  }
  await expect(a.locator(".seat:not(.empty)")).toHaveCount(6);
  await expect(others[0].locator(".seatcards .card")).toHaveCount(0);
  await click(a, "Сбросить");
  await expect(others[0].locator(".seatcards .card")).toHaveCount(2);
  const pages = [a, b, ...others];
  for (const index of [4, 5, 0, 1, 2, 3]) {
    await pages[index].getByRole("button", {name: /^(Уравнять|Чек)/}).click();
  }
  for (let street = 0; street < 2; street++) {
    for (const index of [2, 3, 4, 5, 0, 1]) await click(pages[index], "Чек");
  }
  const actor = pages[2];
  await expect(actor.locator(".board .card:not(.blank)")).toHaveCount(5);
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    await actor.setViewportSize({ width, height });
    for (const el of await actor
      .locator(
        ".seat,.seatcards .card,.board,.pot,.timer,.controls button,.controls input",
      )
      .all()) {
      await expect(el).toBeInViewport({ ratio: 1 });
      expect(
        await el.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return e.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
      ).toBe(true);
    }
    expect(
      await actor.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await actor.screenshot({
      path: test.info().outputPath("table-" + width + ".png"),
    });
  }
  await click(a, "Выйти");
  await expect(a.getByLabel("Ваш ник")).toBeVisible();
  await expect(b.getByRole("heading", { name: "Открытый стол" })).toBeVisible();
  for (const p of pages) await p.context().close();
});
