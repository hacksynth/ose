import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { MainNav } from '@/components/main-nav';
import { DecorativeBackground } from '@/components/decorative-background';
import { AIAssistantLoader } from '@/components/ai-assistant-loader';
import { AIStatusProvider } from '@/components/ai-status-context';
import { SessionGuard } from '@/components/session-guard';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="ose-page px-4 pb-12 pt-4 md:px-6">
      <DecorativeBackground />
      <div className="relative z-10">
        <SessionGuard />
        <MainNav userName={session.user.name || '学习伙伴'} userEmail={session.user.email} />
        <AIStatusProvider>
          {children}
          <AIAssistantLoader />
        </AIStatusProvider>
      </div>
    </div>
  );
}
