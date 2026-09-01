/** Brand icon set: 2px stroke, rounded caps, sized by the parent's font-size. */

type IconProps = { className?: string };

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <rect x="6" y="4.5" width="4.5" height="15" rx="1.25" />
      <rect x="13.5" y="4.5" width="4.5" height="15" rx="1.25" />
    </svg>
  );
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" opacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export function VolumeIcon({ className, muted }: IconProps & { muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M4 9.5h3.2L12 5.4a.7.7 0 0 1 1.2.55v12.1a.7.7 0 0 1-1.2.55L7.2 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
        fill="currentColor"
        stroke="none"
      />
      {muted ? (
        <path d="M17 9.5l4.5 5m0-5-4.5 5" />
      ) : (
        <>
          <path d="M16.8 9a4.2 4.2 0 0 1 0 6" />
          <path d="M19.4 6.6a7.8 7.8 0 0 1 0 10.8" />
        </>
      )}
    </svg>
  );
}

export function ThumbUpIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1H7Z" />
      <path d="M7 10.5 11.2 3.6a.9.9 0 0 1 1.65.5V9h5.3a2 2 0 0 1 1.96 2.4l-1.1 5.6a2 2 0 0 1-1.96 1.6H7" />
    </svg>
  );
}

export function ThumbDownIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 13.5v-9H4.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1H7Z" />
      <path d="M7 13.5 11.2 20.4a.9.9 0 0 0 1.65-.5V15h5.3a2 2 0 0 0 1.96-2.4l-1.1-5.6A2 2 0 0 0 16.85 5.4H7" />
    </svg>
  );
}
