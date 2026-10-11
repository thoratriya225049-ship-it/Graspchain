/**
 * The whole icon set. Status glyphs (pass/vague/fail/missed) always appear next to a word;
 * action glyphs only where they speed recognition (download, external, copy).
 */
const PATHS = {
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
  vague: "M2.5 9c1.6-2.2 3.2-2.2 4.8 0s3.2 2.2 4.8 0",
  cross: "M4 4l8 8M12 4l-8 8",
  missed: "", // drawn as a ring
  dash: "M4 8h8",
  alert: "M8 3.5v5.5M8 11.5v.5",
  arrow: "M3 8h9.5M9 4.5 12.5 8 9 11.5",
  back: "M13 8H3.5M7 4.5 3.5 8 7 11.5",
  external: "M6.5 3.5h-3v9h9v-3M9 3.5h3.5V7M12.5 3.5 7 9",
  download: "M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13h10",
  upload: "M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13h10",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  chevron: "M6 4l4 4-4 4",
  down: "M4 6l4 4 4-4",
  close: "M4 4l8 8M12 4l-8 8",
  menu: "M2.5 5h11M2.5 8h11M2.5 11h11",
  link: "M6.8 9.2 9.2 6.8M7.6 4.4l.9-.9a2.4 2.4 0 0 1 3.4 3.4l-.9.9M8.4 11.6l-.9.9a2.4 2.4 0 0 1-3.4-3.4l.9-.9",
  replay: "M3 8a5 5 0 1 0 1.5-3.6M3 3v2.5h2.5",
  info: "M8 7.2v4M8 4.8v.2",
  lock: "M4.5 7.5h7v5.5h-7zM5.8 7.5V5.6a2.2 2.2 0 0 1 4.4 0v1.9",
  file: "M4 2.5h5l3 3v8H4zM9 2.5v3h3",
  qr: "M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9.5 9.5h1.5v1.5H9.5zM11.5 11.5H13V13h-1.5z",
  book: "M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z",
  pen: "M10.5 3 13 5.5 6 12.5H3.5V10z",
  nodes: "M8 3v3M8 10v3M3.5 8h3M9.5 8h3",
  eye: "M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8zM8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {name === "missed" ? (
        <circle cx="8" cy="8" r="4.25" />
      ) : name === "alert" || name === "info" ? (
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d={PATHS[name]} />
        </>
      ) : name === "nodes" ? (
        <>
          <circle cx="8" cy="8" r="1.6" />
          <circle cx="8" cy="2.5" r="1.1" />
          <circle cx="8" cy="13.5" r="1.1" />
          <circle cx="2.5" cy="8" r="1.1" />
          <circle cx="13.5" cy="8" r="1.1" />
          <path d={PATHS.nodes} />
        </>
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}
