import { useEffect, useState } from "react";
import { type Board, type Clue, type FinalClue, blankBoard, validateBoard } from "../engine/board";
import sample from "../boards/sample.json";
import { currentBoard } from "./board";
import { loadDraft, saveBoard, saveDraft } from "./ids";

type Answerish = Pick<Clue, "clue" | "answer" | "accept" | "source">;

const parseList = (s: string) => {
  const items = s.split(",").map((x) => x.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

const missing = (c: Answerish) => (c.clue.trim() ? 0 : 1) + (c.answer.trim() ? 0 : 1);

function ClueFields({ c, label, version, onChange }: { c: Answerish; label: string; version: number; onChange: (patch: Partial<Answerish>) => void }) {
  return (
    <div className="clue-edit">
      <strong>{label}</strong>
      <textarea value={c.clue} onChange={(e) => onChange({ clue: e.target.value })} placeholder="Clue" rows={2} />
      <input value={c.answer} onChange={(e) => onChange({ answer: e.target.value })} placeholder="Answer" />
      {/* Uncontrolled so a trailing comma survives while typing. */}
      <input
        key={`accept-${version}`}
        defaultValue={c.accept?.join(", ") ?? ""}
        onChange={(e) => onChange({ accept: parseList(e.target.value) })}
        placeholder="Also accept (comma-separated)"
      />
      <input value={c.source ?? ""} onChange={(e) => onChange({ source: e.target.value || undefined })} placeholder="Source URL" />
    </div>
  );
}

export function Editor() {
  const [board, setBoard] = useState<Board>(() => (loadDraft() as Board | null) ?? currentBoard());
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    saveDraft(board);
    setSaved(false);
  }, [board]);

  const errors = validateBoard(board);
  const replace = (b: Board) => {
    setBoard(b);
    setVersion((v) => v + 1);
  };
  const setClue = (c: number, r: number, patch: Partial<Clue>) =>
    setBoard((b) => ({
      ...b,
      categories: b.categories.map((cat, i) =>
        i !== c ? cat : { ...cat, clues: cat.clues.map((clue, j) => (j !== r ? clue : { ...clue, ...patch })) },
      ),
    }));
  const setCategoryTitle = (c: number, title: string) =>
    setBoard((b) => ({ ...b, categories: b.categories.map((cat, i) => (i !== c ? cat : { ...cat, title })) }));
  const setFinal = (patch: Partial<FinalClue>) => setBoard((b) => ({ ...b, final: { ...b.final, ...patch } }));

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="editor">
      <p className="eyebrow">
        <a href="./">Guest of Honor</a> · Board editor
      </p>
      <div className="editor-head">
        <input className="big" value={board.title} onChange={(e) => setBoard({ ...board, title: e.target.value })} placeholder="Board title, like Sam's 30th" />
        <input value={board.honoree} onChange={(e) => setBoard({ ...board, honoree: e.target.value })} placeholder="Guest of honor's first name" />
      </div>

      <div className="editor-bar">
        <button className="primary" disabled={errors.length > 0} onClick={() => (saveBoard(board), setSaved(true))}>
          Use this board
        </button>
        <button onClick={download}>Download</button>
        <button className="link" onClick={() => replace(sample as Board)}>
          Start from the sample
        </button>
        <button className="link" onClick={() => replace(blankBoard())}>
          Start blank
        </button>
      </div>
      {saved && <p className="badge right">Saved. Start a room from the home page and it'll use this board.</p>}
      {errors.length > 0 && (
        <details className="banner">
          <summary>{errors.length} things to fix before you can use it</summary>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      {board.categories.map((cat, c) => {
        const todo = (cat.title.trim() ? 0 : 1) + cat.clues.reduce((n, clue) => n + missing(clue), 0);
        return (
          <details key={c} className="category-edit">
            <summary>
              Category {c + 1}: {cat.title || <em>untitled</em>} {todo > 0 && <small className="muted">({todo} missing)</small>}
            </summary>
            <input value={cat.title} onChange={(e) => setCategoryTitle(c, e.target.value)} placeholder="Category name" />
            {cat.clues.map((clue, r) => (
              <ClueFields key={r} c={clue} label={String(clue.value)} version={version} onChange={(patch) => setClue(c, r, patch)} />
            ))}
          </details>
        );
      })}

      <details className="category-edit">
        <summary>
          Final round: {board.final.category || <em>untitled</em>}{" "}
          {missing(board.final) + (board.final.category.trim() ? 0 : 1) > 0 && <small className="muted">(missing)</small>}
        </summary>
        <input value={board.final.category} onChange={(e) => setFinal({ category: e.target.value })} placeholder="Final category" />
        <ClueFields c={board.final} label="Final" version={version} onChange={setFinal} />
      </details>
    </main>
  );
}
