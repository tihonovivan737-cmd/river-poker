import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import type { Entry, Move, Options, Table } from "./types";
import "./style.css";
import "./club.css";

const socket = io(
  import.meta.env.VITE_SERVER_URL ||
    location.protocol + "//" + location.hostname + ":3001",
  {
    autoConnect: false,
    auth: (cb) => cb({ token: sessionStorage.getItem("river-seat") }),
  },
);
const inviteCode = () =>
  new URLSearchParams(location.hash.slice(1)).get("room") || "";
const suits: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
function Card({ value }: { value?: string }) {
  if (!value) return <span className="card blank">♢</span>;
  return (
    <span className={"card " + ("hd".includes(value[1]) ? "red" : "")}>
      <b>{value[0] === "T" ? "10" : value[0]}</b>
      <i>{suits[value[1]]}</i>
    </span>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>♠</span> Ривер
    </div>
  );
}
function Lobby({ connected }: { connected: boolean }) {
  const [name, setName] = useState(localStorage.getItem("river-name") || ""),
    [mode, setMode] = useState(inviteCode() ? "join" : "home");
  const [code, setCode] = useState(inviteCode()),
    [title, setTitle] = useState("Домашний стол"),
    [priv, setPriv] = useState(true),
    [size, setSize] = useState(6);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function enter(kind: Entry["mode"]) {
    if (!name.trim()) {
      setError("Введите ник");
      document.querySelector<HTMLInputElement>("#nick")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    localStorage.setItem("river-name", name);
    socket
      .timeout(8000)
      .emit(
        "enter",
        { mode: kind, name, title, private: priv, size, code },
        (err: unknown, res: { token?: string; error?: string }) => {
          setBusy(false);
          if (err || res.error) setError(res?.error || "Сервер не ответил");
          else if (res.token) sessionStorage.setItem("river-seat", res.token);
        },
      );
  }
  return (
    <main className={"lobby mode-" + mode}>
      <section className="lobby-hero">
        <div className="entrance">
          <h1>
            {mode === "create"
              ? "Новая комната"
              : mode === "join"
                ? "Вход по коду"
                : "Техасский холдем"}
          </h1>
          <p>
            {mode === "home"
              ? "Безлимитный покер на виртуальные фишки"
              : mode === "create"
                ? "Выберите параметры своего стола."
                : "Введите ник и код приглашения."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enter(
                mode === "home"
                  ? "quick"
                  : mode === "create"
                    ? "create"
                    : "join",
              );
            }}
          >
            <label>
              Ваш ник
              <input
                id="nick"
                placeholder="Имя за столом"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {mode === "create" && (
              <>
                <label>
                  Название комнаты
                  <input
                    required
                    maxLength={40}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <div className="pair">
                  <label>
                    Видимость
                    <select
                      value={priv ? "private" : "public"}
                      onChange={(e) => setPriv(e.target.value === "private")}
                    >
                      <option value="private">Приватная</option>
                      <option value="public">Публичная</option>
                    </select>
                  </label>
                  <label>
                    Мест
                    <select
                      value={size}
                      onChange={(e) => setSize(+e.target.value)}
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
            {mode === "join" && (
              <label>
                Код комнаты
                <input
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
            )}
            {error && <div role="alert">{error}</div>}
            <button className="gold" disabled={!connected || busy}>
              {mode === "home"
                ? "Быстрая игра"
                : mode === "create"
                  ? "Открыть стол"
                  : "Войти за стол"}{" "}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          {mode === "home" ? (
            <>
              <button
                className="outline"
                onClick={() => {
                  setError("");
                  setMode("create");
                }}
              >
                Создать комнату
              </button>
              <button
                className="link"
                onClick={() => {
                  setError("");
                  setMode("join");
                }}
              >
                Войти по коду
              </button>
            </>
          ) : (
            <button
              className="link"
              onClick={() => {
                setMode("home");
                setError("");
              }}
            >
              ← В лобби
            </button>
          )}
        </div>
      </section>
      <section className="table-specs">
        <h2>Параметры стола</h2>
        <div className="limits">
          <div>
            Стартовый стек<b>1 000</b>
          </div>
          <div>
            Блайнды<b>5 / 10</b>
          </div>
          <div>
            Мест за столом<b>2 — 6</b>
          </div>
        </div>
      </section>
    </main>
  );
}
function Actions({
  o,
  t,
  connected,
}: {
  o: Options;
  t: Table;
  connected: boolean;
}) {
  const [amount, setAmount] = useState(String(o.min)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function move(move: Move) {
    if (busy || !connected) return;
    setBusy(true);
    socket
      .timeout(4000)
      .emit(
        "move",
        { turn: t.turn, move, amount: Number(amount) },
        (err: unknown, ok: boolean) => {
          setBusy(false);
          if (err || !ok) setError("Ход истёк или ставка недоступна");
        },
      );
  }
  return (
    <fieldset disabled={busy || !connected} className="controls">
      {o.canRaise && (
        <div className="sizing">
          <label>
            Ставка за круг{" "}
            <input
              aria-label="Сумма ставки"
              type="number"
              min={o.min}
              max={o.max}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <input
            className="bet-slider"
            aria-label="Выбрать ставку ползунком"
            type="range"
            min={o.min}
            max={o.max}
            value={Math.max(o.min, Math.min(o.max, Number(amount) || o.min))}
            onChange={(e) => setAmount(e.target.value)}
          />
          {[0.5, 1].map((f) => (
            <button
              key={f}
              onClick={() =>
                setAmount(
                  String(
                    Math.min(
                      o.max,
                      Math.max(
                        o.min,
                        Math.round((t.pot + o.call) * f) +
                          t.players.find((p) => p.id === t.me)!.bet +
                          o.call,
                      ),
                    ),
                  ),
                )
              }
            >
              {f === 1 ? "Банк" : "½ банка"}
            </button>
          ))}
        </div>
      )}
      <div className="moves">
        <button onClick={() => move("fold")}>Сбросить</button>
        <button onClick={() => move(o.call ? "call" : "check")}>
          {o.call ? "Уравнять " + o.call : "Чек"}
        </button>
        {o.canRaise && (
          <button
            className="gold"
            disabled={
              !Number.isInteger(+amount) || +amount < o.min || +amount > o.max
            }
            onClick={() => move("raise")}
          >
            {o.opening ? "Поставить " : "Повысить до "}
            {amount}
          </button>
        )}
        {o.allin && (
          <button onClick={() => move("allin")}>Олл-ин · {o.max}</button>
        )}
      </div>
      {error && <small>{error}</small>}
    </fieldset>
  );
}
function RoomView({ t, connected }: { t: Table; connected: boolean }) {
  const [now, setNow] = useState(Date.now()),
    [copy, setCopy] = useState("");
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const coords = [
    [50, 92],
    [12, 73],
    [12, 26],
    [50, 8],
    [88, 26],
    [88, 73],
  ];
  const spots = [
    [],
    [],
    [0, 3],
    [0, 2, 4],
    [0, 1, 3, 5],
    [0, 1, 2, 4, 5],
    [0, 1, 2, 3, 4, 5],
  ][t.size];
  async function invite() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopy("Ссылка скопирована");
    } catch {
      setCopy(location.href);
    }
  }
  return (
    <main className="room">
      <div className="roomheading">
        <div>
          <small>
            {t.private ? "Приватная комната" : "Публичная комната"} ·{" "}
            {t.players.length} из {t.size} мест
          </small>
          <h1>{t.title}</h1>
        </div>
        <div className="invite">
          <span>
            Код <b>{t.code}</b>
          </span>
          <button onClick={invite}>Скопировать приглашение</button>
          {copy && <small>{copy}</small>}
        </div>
        <button
          className="link"
          disabled={!connected}
          onClick={() => socket.emit("leave")}
        >
          Выйти
        </button>
      </div>
      <div className="gamegrid">
        <div className="arena">
          <div className="felt"></div>
          <div className="center">
            <small>{t.street}</small>
            <div className="board">
              {Array.from({ length: 5 }, (_, i) => (
                <Card key={i} value={t.board[i]} />
              ))}
            </div>
            <b className="pot">Банк · {t.pot}</b>
          </div>
          {spots.map((pos, i) => {
            const id = (t.me + i) % t.size,
              p = t.players.find((p) => p.id === id),
              [x, y] = coords[pos];
            return (
              <div
                key={id}
                className={
                  "seat " +
                  (id === t.actor ? "active " : "") +
                  (p ? "" : "empty")
                }
                style={{ left: x + "%", top: y + "%" }}
              >
                {p ? (
                  <>
                    <div className="seatcards">
                      {!p.cards.length &&
                        t.actor >= 0 &&
                        (p.status === "" || p.status === "Олл-ин") && (
                          <span
                            className="concealed"
                            aria-label="Две закрытые карты"
                          />
                        )}
                      {p.cards.map((c) => (
                        <Card key={c} value={c} />
                      ))}
                    </div>
                    <div className="seatname">
                      <span className="player-avatar" aria-hidden="true">
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                      {id === t.button && <i>D</i>}
                      {p.name}
                      {id === t.me ? " · вы" : ""}
                    </div>
                    <b>{p.stack.toLocaleString("ru")}</b>
                    {id === t.actor && (
                      <span className="timer">
                        {Math.max(0, Math.ceil((t.deadline - now) / 1000))} с
                      </span>
                    )}
                    <small>
                      {!p.connected ? "Нет связи" : p.status}
                      {p.bet ? " · " + p.bet + " в игре" : ""}
                    </small>
                  </>
                ) : (
                  <>Свободно</>
                )}
              </div>
            );
          })}
        </div>
        <aside>
          <h2>История раздачи</h2>
          <small>Бот-дилер · № {t.hand}</small>
          <ol>
            {t.log
              .slice()
              .reverse()
              .map((s, i) => (
                <li key={t.log.length - i}>{s}</li>
              ))}
          </ol>
        </aside>
      </div>
      <section className="actionbar">
        <div>
          <small>Блайнды 5 / 10</small>
          <h2>
            {t.legal
              ? "Ваш ход"
              : t.result
                ? "Итог раздачи"
                : t.actor < 0
                  ? "Ожидаем игроков"
                  : "Ход соперника"}
          </h2>
        </div>
        {t.legal ? (
          <Actions key={t.turn} o={t.legal} t={t} connected={connected} />
        ) : (
          <p>
            {t.result ||
              (!t.hand
                ? "Дилер начнёт, когда за столом будут двое."
                : t.players.find((p) => p.id === t.actor)?.name)}
          </p>
        )}
      </section>
    </main>
  );
}
function App() {
  const [table, setTable] = useState<Table | null>(null),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    socket
      .on("connect", () => setConnected(true))
      .on("disconnect", () => setConnected(false));
    socket.on("table", (t: Table) => {
      history.replaceState(null, "", "#room=" + t.code);
      setTable(t);
    });
    socket.on("lobby", () => {
      if (sessionStorage.getItem("river-seat"))
        history.replaceState(null, "", location.pathname);
      sessionStorage.removeItem("river-seat");
      setTable(null);
    });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  return (
    <>
      <header>
        <Brand />
        <div className="status">
          <i className={connected ? "online" : ""} />
          {connected ? "Дилер на связи" : "Подключение к дилеру…"}
        </div>
      </header>
      {table ? (
        <RoomView t={table} connected={connected} />
      ) : (
        <Lobby connected={connected} />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
