import { moveName } from "@/lib/moves";

/**
 * The three hands as flat printed shapes: a stone, a sheet with a folded
 * corner, and an open pair of scissors. They take their colour from the text
 * colour, so one glyph works on paper and on ink.
 */
export function Hand({
  move,
  size = 96,
  className,
  title,
}: {
  move: number;
  size?: number;
  className?: string;
  title?: string;
}) {
  const label = title ?? moveName(move);
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label}
    >
      {move === 0 && (
        <path
          fill="currentColor"
          d="M28 78c-9-7-13-19-9-31 4-13 16-23 31-26 9-2 17 0 24 4 5-2 12-1 17 3 10 8 13 22 9 35-3 12-12 22-24 27-14 6-35 1-48-12Z"
        />
      )}
      {move === 1 && (
        <g>
          <path fill="currentColor" d="M26 14h50l22 22v70H26Z" />
          <path fill="var(--color-paper)" opacity="0.55" d="M76 14v22h22Z" />
          <path
            stroke="var(--color-paper)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.55"
            d="M40 56h42M40 72h42M40 88h26"
          />
        </g>
      )}
      {move === 2 && (
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <path strokeWidth="13" d="M38 78 94 18M82 78 26 18" />
          <circle cx="32" cy="92" r="13" strokeWidth="9" />
          <circle cx="88" cy="92" r="13" strokeWidth="9" />
        </g>
      )}
      {move !== 0 && move !== 1 && move !== 2 && (
        <g>
          <rect x="22" y="22" width="76" height="76" rx="14" fill="currentColor" opacity="0.18" />
          <text
            x="60"
            y="78"
            textAnchor="middle"
            fontSize="56"
            fontWeight="700"
            fill="currentColor"
          >
            ?
          </text>
        </g>
      )}
    </svg>
  );
}
