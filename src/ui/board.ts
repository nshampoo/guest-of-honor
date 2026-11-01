import { type Board, validateBoard } from "../engine/board";
import sample from "../boards/sample.json";
import { loadedBoard } from "./ids";

export function currentBoard(): Board {
  const board = loadedBoard();
  return board && validateBoard(board).length === 0 ? (board as Board) : (sample as Board);
}
