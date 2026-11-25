import { randomInt, randomUUID } from "node:crypto";
import { rank } from "./rank";
import type { Move, Options } from "../src/types";
export class Player {
  stack = 1000;
  bet = 0;
  invested = 0;
  cards: string[] = [];
  folded = false;
  actedAt: number | null = null;
  connected = true;
  left = false;
  offlineSince = 0;
  constructor(
    public id: number,
    public name: string,
  ) {}
}
export class Game {
  players: Player[] = [];
  board: string[] = [];
  deck: string[] = [];
  log: string[] = [];
  button = -1;
  actor = -1;
  hand = 0;
  street = "Ожидание";
  target = 0;
  increment = 10;
  turn = "";
  deadline = 0;
  showdown = false;
  result = "";
  get playing() {
    return this.actor >= 0;
  }
  get pot() {
    return this.players.reduce((s, p) => s + p.invested, 0);
  }
  get live() {
    return this.players.filter((p) => p.cards.length && !p.folded);
  }
  note(s: string) {
    this.log.push(s);
    if (this.log.length > 80) this.log.shift();
  }
  next(id: number, list: Player[]) {
    return list
      .slice()
      .sort((a, b) => ((a.id - id + 5) % 6) - ((b.id - id + 5) % 6))[0];
  }
  pay(p: Player, n: number) {
    p.bet += n;
    p.invested += n;
    p.stack -= n;
  }
  start() {
    if (this.playing) return;
    const ready = this.players.filter(
      (p) => p.connected && !p.left && p.stack > 0,
    );
    if (ready.length < 2) return;
    this.hand++;
    this.board = [];
    this.result = "";
    this.showdown = false;
    this.street = "Префлоп";
    this.deck = [..."shdc"].flatMap((s) =>
      [..."23456789TJQKA"].map((r) => r + s),
    );
    for (let i = 51; i > 0; i--) {
      const j = randomInt(i + 1);
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
    for (const p of this.players) {
      p.cards = [];
      p.folded = false;
      p.bet = p.invested = 0;
      p.actedAt = null;
    }
    for (let i = 0; i < 2; i++)
      for (const p of ready) p.cards.push(this.deck.pop()!);
    this.button = this.next(this.button, ready).id;
    const sb =
      ready.length === 2
        ? ready.find((p) => p.id === this.button)!
        : this.next(this.button, ready);
    const bb = this.next(sb.id, ready);
    this.target = this.increment = 10;
    this.pay(sb, Math.min(5, sb.stack));
    this.pay(bb, Math.min(10, bb.stack));
    this.note(
      "Раздача №" +
        this.hand +
        " · блайнды " +
        sb.name +
        " " +
        sb.bet +
        " / " +
        bb.name +
        " " +
        bb.bet,
    );
    this.advance(bb.id);
  }
  options(p: Player): Options {
    const call = Math.min(p.stack, Math.max(0, this.target - p.bet)),
      max = p.bet + p.stack;
    const min = this.target + this.increment;
    const reopened =
      p.actedAt === null || this.target - p.actedAt >= this.increment;
    const opponent = this.live.some((q) => q !== p && q.stack > 0);
    const raise = reopened && opponent && max > this.target;
    return {
      call,
      min,
      max,
      canRaise: raise && max >= min,
      allin: raise || p.stack === call,
      opening: this.target === 0,
    };
  }
  act(p: Player, turn: string, move: Move, amount?: number) {
    if (p.id !== this.actor || turn !== this.turn) return false;
    const o = this.options(p);
    let message = "";
    if (move === "fold") {
      p.folded = true;
      message = "сброс карт";
    } else if (move === "check" && o.call === 0) {
      message = "чек";
    } else if (move === "call" && o.call > 0) {
      this.pay(p, o.call);
      message = "колл " + o.call;
    } else if (
      (move === "allin" && o.allin) ||
      (move === "raise" &&
        o.canRaise &&
        Number.isSafeInteger(amount) &&
        amount! >= o.min &&
        amount! <= o.max)
    ) {
      const to = move === "allin" ? o.max : amount!;
      this.pay(p, to - p.bet);
      if (to > this.target) {
        this.increment = Math.max(this.increment, to - this.target);
        this.target = to;
      }
      message =
        (move === "allin"
          ? "олл-ин до "
          : o.opening
            ? "ставка "
            : "повышение до ") + to;
    } else return false;
    p.actedAt = this.target;
    this.note(p.name + " · " + message);
    this.advance(p.id);
    return true;
  }
  advance(after: number) {
    while (this.live.length > 1) {
      const active = this.live.filter((p) => p.stack > 0);
      // With one stack left, only chips already committed by a live opponent can be called.
      if (active.length === 1)
        this.target = Math.max(...this.live.map((p) => p.bet));
      const pending = active.filter(
        (p) => p.bet < this.target || (active.length > 1 && p.actedAt === null),
      );
      if (pending.length) {
        this.actor = this.next(after, pending).id;
        this.turn = randomUUID();
        this.deadline = Date.now() + 30000;
        return;
      }
      if (this.board.length === 5) break;
      this.deck.pop();
      const n = this.board.length === 0 ? 3 : 1;
      for (let i = 0; i < n; i++) this.board.push(this.deck.pop()!);
      this.street = ["", "", "", "Флоп", "Тёрн", "Ривер"][this.board.length];
      this.note(this.street + " · " + this.board.slice(-n).join(" "));
      for (const p of this.players) {
        p.bet = 0;
        p.actedAt = null;
      }
      this.target = 0;
      this.increment = 10;
      after = this.button;
    }
    this.finish();
  }
  finish() {
    this.showdown = this.live.length > 1;
    const scores = new Map(
      this.live.map((p) => [
        p,
        this.showdown ? rank([...p.cards, ...this.board]) : 0,
      ]),
    );
    const levels = [...new Set(this.players.map((p) => p.invested))]
      .filter(Boolean)
      .sort((a, b) => a - b);
    let prev = 0;
    const payouts = new Map<Player, number>();
    for (const level of levels) {
      const contributors = this.players.filter((p) => p.invested >= level);
      const value = (level - prev) * contributors.length;
      prev = level;
      if (contributors.length === 1) {
        contributors[0].stack += value;
        this.note(contributors[0].name + " · возврат неуравненной ставки " + value);
        continue;
      }
      const contenders = contributors.filter((p) => scores.has(p));
      const eligible = contenders.length ? contenders : this.live;
      const best = Math.max(...eligible.map((p) => scores.get(p)!));
      const winners = eligible
        .filter((p) => scores.get(p) === best)
        .sort(
          (a, b) =>
            ((a.id - this.button + 5) % 6) - ((b.id - this.button + 5) % 6),
        );
      winners.forEach((p, i) =>
        payouts.set(
          p,
          (payouts.get(p) ?? 0) +
            Math.floor(value / winners.length) +
            (i < value % winners.length ? 1 : 0),
        ),
      );
    }
    const lines: string[] = [];
    for (const [p, n] of payouts) {
      p.stack += n;
      lines.push(p.name + " получает " + n);
    }
    this.result = lines.join(" · ");
    this.note(this.result);
    this.actor = -1;
    this.deadline = 0;
    this.turn = "";
    this.street = this.showdown ? "Вскрытие" : "Раздача завершена";
    for (const p of this.players) {
      p.bet = p.invested = 0;
    }
  }
}
