import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from './providers';
import './globals.css';

// Local assets preserve the three type voices without Google Fonts requests at build time.
const newsreader = localFont({
  src: [
    { path: '../assets/fonts/newsreader-normal.woff2', weight: '200 800', style: 'normal' },
    { path: '../assets/fonts/newsreader-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
});
const plexSans = localFont({
  src: '../assets/fonts/plex-sans-normal.woff2',
  weight: '400 600',
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexMono = localFont({
  src: [
    { path: '../assets/fonts/plex-mono-400.woff2', weight: '400' },
    { path: '../assets/fonts/plex-mono-500.woff2', weight: '500' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FlowState',
  description: 'Turn repetitive work into workflows that run themselves and see exactly what every run did.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        {/* Apply the stored preference before paint to avoid a light flash on dark visits. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var p=localStorage.getItem('flowstate-theme');document.documentElement.dataset.theme=(p==='light'||p==='dark')?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}` }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
