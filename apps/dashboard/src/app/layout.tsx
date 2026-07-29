import type { Metadata } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';

import { copy } from '@/copy/en';
import { themeVariables } from '@/theme/cssVariables';

import './globals.css';

// The same two typefaces as the app (docs/spec/05). next/font downloads and self-hosts
// them at build time, so nothing is fetched from Google at runtime and there is no
// layout shift from a swap.
const display = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['700', '800'],
  display: 'swap',
});

const body = Hanken_Grotesk({
  variable: '--font-hanken',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: copy.app.name,
  description: copy.app.description,
  // A staff tool has no business in a search index.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Design tokens as CSS variables, generated from packages/shared. Inlined in
            the document so the first paint is already themed: a flash of the wrong
            theme is a real visual defect, not a nicety. */}
        {/* Generated from our own token module, never from user input. */}
        <style dangerouslySetInnerHTML={{ __html: themeVariables() }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only rounded-button bg-btn px-4 py-2 text-btn-text focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          {copy.app.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
