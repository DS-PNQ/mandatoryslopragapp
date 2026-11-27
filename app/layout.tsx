import type {Metadata, Viewport} from 'next';
import Link from 'next/link';
import {Mark} from '@/components/icons';
import {NavLinks} from '@/components/NavLinks';
import {NotebookHost} from '@/components/NotebookHost';
import {engines} from '@/lib/agent/answer';
import {getManimStatus} from '@/lib/manim/render';
import {getIndex} from '@/lib/rag/load';
import {ocrConfig} from '@/lib/uploads/transcribe';
import {THEME_SCRIPT, ThemeToggle} from '@/components/ThemeToggle';
import '@fontsource-variable/inter/index.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'LemmaSlop, a math notebook',
  description:
    'Ask questions of your own PDFs, Word files and images, or a library of math notes, and get sourced, typeset answers with Manim animations.',
};

export const viewport: Viewport = {
  themeColor: [
    {media: '(prefers-color-scheme: light)', color: '#eceff3'},
    {media: '(prefers-color-scheme: dark)', color: '#07090c'},
  ],
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const index = getIndex();
  const manim = await getManimStatus();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: THEME_SCRIPT}} />
      </head>
      <body>
        <div className="liquid-bg" aria-hidden="true">
          <span className="blob blob-a" />
          <span className="blob blob-b" />
          <span className="blob blob-c" />
        </div>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <Link href="/" className="wordmark" aria-label="LemmaSlop, home">
            <Mark />
            <span>LemmaSlop</span>
          </Link>
          <NavLinks />
          <div className="topbar-end">
            <ThemeToggle />
          </div>
        </header>
        <NotebookHost
          engines={engines().map(({id, label, model, available, vision}) => ({id, label, model, available, vision}))}
          library={{notes: new Set(index.chunks.map((c) => c.noteId)).size, passages: index.chunks.length}}
          animation={{available: manim.available}}
          ocr={{available: ocrConfig() !== null, model: ocrConfig()?.label ?? null}}
        />
        {children}
      </body>
    </html>
  );
}
