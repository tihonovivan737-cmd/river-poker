export type Move = "fold" | "check" | "call" | "raise" | "allin";
export interface Options {
  call: number;
  min: number;
  max: number;
  canRaise: boolean;
  allin: boolean;
  opening: boolean;
}
export interface Seat {
  id: number;
  name: string;
  stack: number;
  bet: number;
  status: string;
  cards: string[];
  connected: boolean;
}
export interface Table {
  code: string;
  title: string;
  private: boolean;
  size: number;
  me: number;
  button: number;
  hand: number;
  street: string;
  pot: number;
  board: string[];
  players: Seat[];
  actor: number;
  deadline: number;
  turn: string;
  legal: Options | null;
  log: string[];
  result: string;
}
export interface Entry {
  mode: "quick" | "create" | "join";
  name: string;
  title?: string;
  private?: boolean;
  size?: number;
  code?: string;
}
