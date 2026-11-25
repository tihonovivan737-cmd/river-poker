import { createServer } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { Server, Socket } from "socket.io";
import { Game, Player } from "./game";
import type { Entry, Table } from "../src/types";

class Room extends Game {
  code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  nextHand = 0;
  constructor(
    public title: string,
    public privateRoom: boolean,
    public size: number,
  ) {
    super();
  }
  view(me: Player): Table {
    return {
      code: this.code,
      title: this.title,
      private: this.privateRoom,
      size: this.size,
      me: me.id,
      actor: this.actor,
      button: this.button,
      hand: this.hand,
      deadline: this.deadline,
      turn: this.turn,
      street: this.street,
      board: this.board,
      pot: this.pot,
      result: this.result,
      log: this.log,
      legal: this.actor === me.id ? this.options(me) : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        bet: p.bet,
        connected: p.connected,
        status: p.folded
          ? "Пас"
          : !p.cards.length
            ? "Ожидает"
            : p.stack === 0 && this.playing
              ? "Олл-ин"
              : "",
        cards: p === me || (this.showdown && !p.folded) ? p.cards : [],
      })),
    };
  }
}
type Session = { room: Room; player: Player; socket?: Socket };
const rooms = new Map<string, Room>(),
  sessions = new Map<string, Session>();
const http = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("River OK");
});
const io = new Server(http, {
  cors: { origin: process.env.CLIENT_ORIGIN || true },
  maxHttpBufferSize: 8192,
});
function publish(r: Room) {
  for (const s of sessions.values())
    if (s.room === r && s.socket) s.socket.emit("table", r.view(s.player));
  if (!r.playing && !r.nextHand)
    r.nextHand = Date.now() + (r.hand ? 4500 : 800);
}
function clean(r: Room) {
  r.players = r.players.filter(
    (p) => !p.left || (r.playing && p.cards.length > 0),
  );
  if (!r.players.length) rooms.delete(r.code);
}
function remove(token: string) {
  const s = sessions.get(token);
  if (!s) return;
  sessions.delete(token);
  const { room: r, player: p } = s;
  p.left = true;
  p.connected = false;
  if (r.playing && p.cards.length && !p.folded && p.stack > 0) {
    p.folded = true;
    r.note(p.name + " покидает стол");
    if (r.actor === p.id || r.live.length === 1) r.advance(p.id);
    else if (r.live.filter((q) => q.stack > 0).length <= 1)
      r.advance((r.actor + 5) % 6);
  }
  clean(r);
  publish(r);
}
function newRoom(title: string, priv: boolean, size: number) {
  let r: Room;
  do {
    r = new Room(title, priv, size);
  } while (rooms.has(r.code));
  rooms.set(r.code, r);
  return r;
}
io.on("connection", (socket) => {
  let token = socket.handshake.auth?.token;
  const previous = sessions.get(token);
  if (previous) {
    const old = previous.socket;
    previous.socket = socket;
    previous.player.connected = true;
    old?.disconnect(true);
    publish(previous.room);
  } else socket.emit("lobby");
  socket.on("enter", (data: Entry, ack) => {
    if (typeof ack !== "function") return;
    if (sessions.has(token)) return ack({ error: "Вы уже за столом" });
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    if (!name || name.length > 20)
      return ack({ error: "Введите ник длиной до 20 символов" });
    let r: Room | undefined;
    if (data.mode === "join") {
      r = rooms.get(String(data.code).trim().toUpperCase());
      if (!r || r.players.length >= r.size)
        return ack({ error: r ? "Стол занят" : "Комната не найдена" });
    } else if (data.mode === "create") {
      if (
        !Number.isInteger(data.size) ||
        data.size! < 2 ||
        data.size! > 6 ||
        typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 40
      )
        return ack({ error: "Проверьте название и число мест" });
      r = newRoom(data.title.trim(), data.private === true, data.size!);
    } else if (data.mode === "quick") {
      const open = [...rooms.values()].filter(
        (t) => !t.privateRoom && t.players.length < t.size,
      );
      const waiting = open.filter(
        (t) =>
          !t.playing &&
          t.players.filter((p) => p.connected && p.stack > 0).length === 1,
      );
      const pool = waiting.length ? waiting : open;
      r = pool.length
        ? pool[randomInt(pool.length)]
        : newRoom("Открытый стол", false, 6);
    } else return ack({ error: "Неизвестный режим" });
    const id = Array.from({ length: r.size }, (_, i) => i).find(
      (i) => !r!.players.some((p) => p.id === i),
    )!;
    const player = new Player(id, name);
    r.players.push(player);
    token = randomBytes(32).toString("hex");
    sessions.set(token, { room: r, player, socket });
    r.note(name + " занимает место");
    ack({ token });
    publish(r);
  });
  socket.on("move", (data, ack) => {
    if (typeof ack !== "function") return;
    const s = sessions.get(token);
    if (
      !s ||
      s.socket !== socket ||
      Date.now() >= s.room.deadline ||
      !s.room.act(s.player, data?.turn, data?.move, data?.amount)
    )
      return ack(false);
    publish(s.room);
    ack(true);
  });
  socket.on("leave", () => {
    if (sessions.get(token)?.socket === socket) remove(token);
    socket.emit("lobby");
  });
  socket.on("disconnect", () => {
    const s = sessions.get(token);
    if (s?.socket !== socket) return;
    s.socket = undefined;
    s.player.connected = false;
    s.player.offlineSince = Date.now();
    publish(s.room);
  });
});
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions)
    if (!s.socket && now - s.player.offlineSince > 120000) remove(token);
  for (const r of rooms.values()) {
    if (r.playing && now >= r.deadline) {
      const p = r.players.find((p) => p.id === r.actor)!;
      r.act(p, r.turn, r.options(p).call ? "fold" : "check");
      publish(r);
    } else if (!r.playing && r.nextHand && now >= r.nextHand) {
      clean(r);
      r.nextHand = 0;
      if (r.players.filter((p) => p.connected && p.stack > 0).length >= 2) {
        r.start();
        publish(r);
      }
    }
  }
}, 150).unref();
http.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("Дилер слушает порт " + (process.env.PORT || 3001)),
);
