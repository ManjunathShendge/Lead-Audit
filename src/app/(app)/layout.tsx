import { requirePageSession } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { currentMode } from '@/lib/collectors';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  return <Shell mode={currentMode()}>{children}</Shell>;
}
