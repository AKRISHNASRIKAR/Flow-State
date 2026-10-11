import Image from 'next/image';
import type { ReactNode } from 'react';

interface DashboardHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  landscape?: boolean;
}

/** The artwork belongs to introductions, leaving data and editing surfaces clear. */
export function DashboardHeading({ eyebrow, title, description, action, landscape = false }: DashboardHeadingProps) {
  return (
    <header className="dashboard-heading mb-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[600px]">
          <p className="label-caps text-muted">{eyebrow}</p>
          <h1 className="mt-4 font-serif text-[clamp(40px,4.5vw,56px)] leading-[1.05] tracking-[-0.025em] text-ink">{title}</h1>
          <p className="mt-4 max-w-[55ch] text-[15px] leading-relaxed text-muted">{description}</p>
        </div>
        {action && <div className="shrink-0 pb-1">{action}</div>}
      </div>
      {landscape && <div className="relative mt-7 h-28 overflow-hidden rounded-[4px] sm:h-36"><Image src="/images/pixel-river.jpg" alt="" fill sizes="(min-width: 1024px) 1000px, 100vw" className="object-cover object-[center_52%]" /><span className="absolute bottom-3 left-3 rounded-[3px] bg-paper px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink">A place for work to flow.</span></div>}
    </header>
  );
}
