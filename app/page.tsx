import {Workspace} from '@/components/Workspace';
import {engines} from '@/lib/agent/answer';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <Workspace engines={engines().map(({id, label, model, available}) => ({id, label, model, available}))} />;
}
