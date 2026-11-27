'use client';

import {usePathname} from 'next/navigation';
import {Workspace, type EngineOption} from './Workspace';

/**
 * Lives in the root layout, so the notebook (its questions, answers and any
 * answer still streaming) survives a visit to another tab. It is only hidden
 * while another page is shown.
 */
export function NotebookHost(props: {
  engines: EngineOption[];
  library: {notes: number; passages: number};
  animation: {available: boolean};
  ocr: {available: boolean; model: string | null};
}) {
  const active = usePathname() === '/';
  return (
    <div className="notebook-host" hidden={!active}>
      <Workspace {...props} active={active} />
    </div>
  );
}
