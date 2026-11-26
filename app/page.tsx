import {Workspace} from '@/components/Workspace';
import {engines} from '@/lib/agent/answer';
import {getManimStatus} from '@/lib/manim/render';
import {getIndex} from '@/lib/rag/load';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const index = getIndex();
  const manim = await getManimStatus();
  return (
    <Workspace
      engines={engines().map(({id, label, model, available, vision}) => ({id, label, model, available, vision}))}
      library={{notes: new Set(index.chunks.map((c) => c.noteId)).size, passages: index.chunks.length}}
      animation={{available: manim.available}}
    />
  );
}
