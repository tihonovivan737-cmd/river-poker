import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import type { Entry, Table } from "../src/types";

test("isolated matchmaking, simultaneous last seat, private payloads and dealer timeouts", async () => {
  const clients: Socket[] = [];
  async function sit(data: Entry) {
    const client = io("http://127.0.0.1:3011", {
      forceNew: true,
      transports: ["websocket"],
    });
    clients.push(client);
    const state = { current: null as Table | null };
    client.on("table", (t: Table) => {
      state.current = t;
    });
    await new Promise<void>((resolve) => client.once("lobby", resolve));
    const reply = await client.emitWithAck("enter", data);
    expect(reply.token).toBeTruthy();
    await expect.poll(() => state.current?.code).toBeTruthy();
    return { client, state };
  }
  try {
    const priv = await sit({
      name: "Приватный",
      mode: "create",
      title: "По коду",
      size: 2,
      private: true,
    });
    const pub = await sit({
      name: "Публичный",
      mode: "create",
      title: "На двоих",
      size: 2,
      private: false,
    });
    const [a, b] = await Promise.all(
      ["А", "Б"].map((name) => sit({ name, mode: "quick" })),
    );
    const codes = [a.state.current!.code, b.state.current!.code];
    expect(codes).not.toContain(priv.state.current!.code);
    expect(
      codes.filter((code) => code === pub.state.current!.code),
    ).toHaveLength(1);
    await sit({ name: "Друг", mode: "join", code: priv.state.current!.code });
    await expect.poll(() => priv.state.current?.actor).toBe(0);
    for (const seat of priv.state.current!.players)
      expect(seat.cards.length).toBe(seat.id === 0 ? 2 : 0);
    expect(priv.state.current).not.toHaveProperty("deck");
    await expect.poll(() => pub.state.current?.actor).toBe(0);
    expect(
      await pub.client.emitWithAck("move", {
        turn: pub.state.current!.turn,
        move: "call",
      }),
    ).toBe(true);
    // Two rooms expire concurrently: facing a blind folds; the big blind can check.
    await Promise.all([
      expect
        .poll(
          () =>
            priv.state.current?.log.some((s) => s === "Приватный · сброс карт"),
          { timeout: 34000 },
        )
        .toBe(true),
      expect
        .poll(() => pub.state.current?.log.some((s) => s.endsWith(" · чек")), {
          timeout: 34000,
        })
        .toBe(true),
    ]);
    expect(pub.state.current?.street).toBe("Флоп");
  } finally {
    for (const c of clients) {
      c.emit("leave");
      c.disconnect();
    }
  }
});
