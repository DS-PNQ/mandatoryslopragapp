// Stroke icons drawn on Lucide's 24-unit grid (lucide.dev, ISC license).
// Decorative by default; pass a `label` when the icon is the only content.

import type {SVGProps} from 'react';

type IconProps = SVGProps<SVGSVGElement> & {label?: string; size?: number};

function make(paths: React.ReactNode) {
  return function Icon({label, size = 18, ...rest}: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={label ? undefined : true}
        aria-label={label}
        role={label ? 'img' : undefined}
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const BookOpen = make(
  <>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </>,
);

export const FileText = make(
  <>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>,
);

export const ImageIcon = make(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>,
);

export const Paperclip = make(
  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
);

export const X = make(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);

export const Plus = make(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);

export const Upload = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8 12 3 7 8" />
    <path d="M12 3v12" />
  </>,
);

export const Film = make(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M3 7.5h4" />
    <path d="M3 12h18" />
    <path d="M3 16.5h4" />
    <path d="M17 3v18" />
    <path d="M17 7.5h4" />
    <path d="M17 16.5h4" />
  </>,
);

export const ArrowUp = make(
  <>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </>,
);

export const Sun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>,
);

export const Moon = make(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);

export const Spinner = make(<path d="M21 12a9 9 0 1 1-6.219-8.56" />);

export const AlertCircle = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </>,
);

export const PanelLeft = make(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </>,
);

export const Download = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </>,
);

export const Copy = make(
  <>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>,
);

export const Check = make(<path d="M20 6 9 17l-5-5" />);

export const Code = make(
  <>
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </>,
);

export const MessageSquare = make(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);

export const RotateCcw = make(
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>,
);

/** Lemma's mark: the end-of-proof tombstone in a rounded tile. */
export function Mark({size = 28}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="mark">
      <rect width="32" height="32" rx="8" className="mark-tile" />
      <path d="M9 9v14h9" className="mark-l" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="19.5" y="17.5" width="5" height="5.5" rx="0.8" className="mark-qed" />
    </svg>
  );
}
