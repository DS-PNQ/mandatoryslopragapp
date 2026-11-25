import type {Metadata, Viewport} from 'next';
import Link from 'next/link';
import {NavLinks} from '@/components/NavLinks';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lemma, a math notes library',
  description: 'Ask questions of a library of mathematics study notes and get sourced, typeset answers.',
};

export const viewport: Viewport = {
  themeColor: [
    {media: '(prefers-color-scheme: light)', color: '#f3f4ef'},
    {media: '(prefers-color-scheme: dark)', color: '#0e0f11'},
  ],
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="masthead">
          <Link href="/" className="wordmark">
            Lemma
          </Link>
          <NavLinks />
        </header>
        {children}
      </body>
    </html>
  );
}
