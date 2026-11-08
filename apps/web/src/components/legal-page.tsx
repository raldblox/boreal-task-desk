import { Container, PageHero } from "@/components/page";

/** A plain policy page: a title, when it last changed, and short sections. */
export function LegalPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <PageHero
        kicker={eyebrow}
        title={title}
        lede={
          <>
            Last updated {updated}
          </>
        }
      />
      <Container className="flex flex-col gap-10 py-10 md:py-14 [&>*]:max-w-[880px]">
      <div className="flex flex-col gap-8">{children}</div>
      </Container>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-light tracking-[-0.025em]">{title}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </section>
  );
}
