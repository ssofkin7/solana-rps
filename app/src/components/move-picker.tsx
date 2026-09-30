"use client";

import { Hand } from "./hand";
import { MOVES, type Move } from "@/lib/moves";

export function MovePicker({
  value,
  onChange,
  legend,
  disabled,
}: {
  value: Move | null;
  onChange: (move: Move) => void;
  legend: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-3 font-display text-lg font-semibold">{legend}</legend>
      <div className="grid grid-cols-3 gap-3">
        {MOVES.map((move) => {
          const chosen = value === move.id;
          return (
            <label
              key={move.id}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-night px-2 pb-3 pt-4 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ink ${
                chosen
                  ? "bg-ink text-paper shadow-[0_4px_0_var(--color-night)]"
                  : "bg-sheet text-ink hover:bg-stake"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="move"
                className="sr-only"
                checked={chosen}
                onChange={() => onChange(move.id)}
              />
              <Hand move={move.id} size={72} />
              <span className="font-display text-base font-semibold">{move.name}</span>
              <span className={`text-sm ${chosen ? "text-paper/80" : "text-muted"}`}>
                beats {move.beats.toLowerCase()}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
