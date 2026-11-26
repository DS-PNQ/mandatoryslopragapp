'use client';

import {useEffect, useState} from 'react';
import {Moon, Sun} from './icons';

/** Runs before paint (inlined in <head>) so the saved theme never flashes. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('lemma:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const set = document.documentElement.dataset.theme;
    setDark(set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('lemma:theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      disabled={dark === null}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
