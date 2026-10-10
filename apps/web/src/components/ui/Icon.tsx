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
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  chevron: "M6 4l4 4-4 4",
  close: "M4 4l8 8M12 4l-8 8",
  menu: "M2.5 5h11M2.5 8h11M2.5 11h11",
  link: "M6.8 9.2 9.2 6.8M7.6 4.4l.9-.9a2.4 2.4 0 0 1 3.4 3.4l-.9.9M8.4 11.6l-.9.9a2.4 2.4 0 0 1-3.4-3.4l.9-.9",
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
      ) : name === "alert" ? (
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d={PATHS.alert} />
        </>
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}
