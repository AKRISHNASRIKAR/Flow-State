import Image from 'next/image';
import Link from 'next/link';
import builderLight from '../../../public/images/workflow-builder-light.webp';
import builderDark from '../../../public/images/workflow-builder-dark.webp';

/** Captured from the actual builder and inspector in an isolated local workspace. */
export function BuilderPreview() {
  return (
    <section id="builder-preview" aria-labelledby="builder-preview-heading" className="mx-auto scroll-mt-8 w-full max-w-[1160px] px-6 pb-16 sm:px-10 sm:pb-24">
      <div className="mb-8 max-w-[660px]">
        <p className="label-caps text-muted">02 / The workspace</p>
        <h2 id="builder-preview-heading" className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">The builder behind the workflow.</h2>
        <p className="mt-5 text-base leading-relaxed text-muted">Edit a step beside the canvas, then open Runs to inspect its inputs and outputs.</p>
      </div>
      <figure>
        <div className="relative overflow-hidden rounded-md border border-rule bg-card">
          {/* These pre-encoded captures keep small interface text clear without recompression. */}
          <Image src={builderLight} alt="The FlowState builder with a manual trigger, a web request and a log step, and the Web request inspector open beside the canvas." unoptimized placeholder="blur" className="block h-auto w-full" />
          {/* The same real capture in each appearance; never invert the product image. */}
          <Image src={builderDark} alt="" aria-hidden unoptimized placeholder="blur" className="builder-capture-dark pointer-events-none absolute inset-0 h-full w-full" />
        </div>
        <figcaption className="mt-3 text-xs leading-relaxed text-muted">Actual FlowState builder, shown with an example workflow.</figcaption>
      </figure>
      <ol className="mt-8 grid gap-6 border-t border-rule pt-6 sm:grid-cols-3">
        {[
          ['01', 'Choose a starting event', 'Use a webhook, a scheduled API check, or the Test run button.'],
          ['02', 'Edit each step', 'Select a node to change its settings in the inspector.'],
          ['03', 'Inspect a run', 'Open Runs to see each step’s input, output, and status.'],
        ].map(([number, title, body]) => <li key={number}><p className="font-mono text-xs text-muted">{number}</p><h3 className="mt-3 text-sm font-medium text-ink">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{body}</p></li>)}
      </ol>
      <Link href="/login" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[3px] py-2.5 text-sm font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal">Open your workspace <span aria-hidden>↗</span></Link>
    </section>
  );
}
