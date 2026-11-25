'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

const LINKS = [
  {href: '/', label: 'Ask'},
  {href: '/library', label: 'Library'},
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="masthead-nav" aria-label="Sections">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
