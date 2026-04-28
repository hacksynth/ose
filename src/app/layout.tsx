import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import type { Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: { default: 'OSE 软考备考', template: '%s | OSE' },
  description: 'OSE - Open Software Exam，一个开源的软考（软件设计师）备考系统。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={nunito.variable}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
