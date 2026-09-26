import Chat from '@/components/Chat';
import { getActiveCorpus } from '@/lib/corpora';
import { toChatUI } from '@/lib/ui';

export default function Page() {
  return <Chat ui={toChatUI(getActiveCorpus())} />;
}
