import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'NotebookLM 修正ツール',
  description: 'PDFの文字化け・ぼやけ文字を自動検出・修正',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <style>{`
          .kbd {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
            height: 18px;
            padding: 0 4px;
            font-family: ui-monospace, monospace;
            font-size: 10px;
            font-weight: 500;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 3px;
            color: #374151;
          }
        `}</style>
      </head>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
