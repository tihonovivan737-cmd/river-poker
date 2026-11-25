import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, Player } from "../server/game";
import { rank } from "../server/rank";
function setup(stacks: number[]) {
  const g = new Game();
  g.players = stacks.map((n, i) =>
    Object.assign(new Player(i, String(i)), { stack: n }),
  );
  g.start();
  return g;
}
test("heads-up blinds, action order, replay, fold and rotating button", () => {
  const g = setup([1000, 1000]),
    [a, b] = g.players;
  assert.deepEqual([g.button, g.actor, a.bet, b.bet], [0, 0, 5, 10]);
  const turn = g.turn;
  assert.equal(g.act(a, turn, "raise", 19), false);
  assert.ok(g.act(a, turn, "raise", 40));
  assert.equal(g.act(a, turn, "raise", 40), false);
  assert.equal(a.stack, 960);
  assert.ok(g.act(b, g.turn, "call"));
  assert.equal(g.actor, 1);
  assert.ok(g.act(b, g.turn, "raise", 10));
  assert.ok(g.act(a, g.turn, "fold"));
  assert.equal(g.showdown, false);
  assert.equal(b.stack, 1040);
  g.start();
  assert.equal(g.button, 1);
});
test("three unequal all-ins award main pot, side pot and excess separately", () => {
  const g = setup([400, 200, 100]);
  g.players[0].cards = ["Qs", "Qh"];
  g.players[1].cards = ["Ks", "Kh"];
  g.players[2].cards = ["As", "Ah"];
  // Draw by popping, including one burn before each street.
  g.deck = ["2s", "3c", "4d", "8h", "9s", "Tc", "6s", "7h"].reverse();
  for (const p of g.players) assert.ok(g.act(p, g.turn, "allin"));
  assert.equal(g.board.length, 5);
  assert.deepEqual(
    g.players.map((p) => p.stack),
    [200, 200, 300],
  );
});
test("short all-in requires a call but does not reopen the raise", () => {
  const g = setup([1000, 45, 1000]),
    [a, b, c] = g.players;
  assert.ok(g.act(a, g.turn, "raise", 40));
  assert.ok(g.act(b, g.turn, "allin"));
  assert.ok(g.act(c, g.turn, "call"));
  assert.equal(g.options(a).call, 5);
  assert.equal(g.options(a).canRaise, false);
  assert.equal(g.act(a, g.turn, "allin"), false);
});
test("board tie awards the odd chip clockwise from the button", () => {
  const g = setup([100, 100, 100]);
  g.board = ["As", "Ks", "Qs", "Js", "Ts"];
  g.players[2].folded = true;
  for (const p of g.players) {
    p.invested = 11;
    p.stack = 89;
  }
  g.finish();
  assert.deepEqual(
    g.players.map((p) => p.stack),
    [105, 106, 89],
  );
});
test("wheel, high straight, full house and quads", () => {
  const score = (s: string) => rank(s.split(" "));
  assert.ok(score("2h 3s 4c 5d 6h Ts Ad") > score("Ah 2s 3c 4d 5h Ts Kd"));
  assert.ok(score("2h 2s 2c 2d 3h As Kd") > score("Ah As Ac Kd Kh Ts 2d"));
});
test("random legal play conserves chips and terminates", () => {
  for (let n = 2; n <= 6; n++)
    for (let run = 0; run < 40; run++) {
      const g = setup(Array.from({ length: n }, (_, i) => 10 + 37 * i));
      const total = g.pot + g.players.reduce((a, p) => a + p.stack, 0);
      assert.equal(
        new Set([...g.deck, ...g.players.flatMap((p) => p.cards)]).size,
        52,
      );
      let turns = 0;
      while (g.playing) {
        const p = g.players.find((p) => p.id === g.actor)!,
          o = g.options(p);
        const choices = [
          "fold",
          o.call ? "call" : "check",
          ...(o.allin ? ["allin"] : []),
          ...(o.canRaise ? ["raise"] : []),
        ] as const;
        assert.ok(
          g.act(
            p,
            g.turn,
            choices[Math.floor(Math.random() * choices.length)] as Parameters<
              Game["act"]
            >[2],
            o.min,
          ),
        );
        assert.equal(g.pot + g.players.reduce((s, p) => s + p.stack, 0), total);
        assert.ok(++turns < 200);
      }
    }
});
