import { createFileRoute } from "@tanstack/react-router";
import { ContentPage, NoteBox } from "~/components/ContentPage";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News & Guides | N2 Wheels" },
      {
        name: "description",
        content:
          "Wheel & tyre news and buying guides from N2 Wheels — sample articles on choosing the right wheel size, summer vs all-season tyres and more. Full articles coming soon.",
      },
    ],
  }),
  component: NewsPage,
});

/** Sample article placeholders — deliberately no dates or authors (nothing fabricated). */
const SAMPLE_ARTICLES: { title: string; blurb: string }[] = [
  {
    title: "Choosing the right wheel size",
    blurb:
      "Diameter, width, offset and PCD explained in plain English — and why bigger isn't always better for your car.",
  },
  {
    title: "Summer vs all-season tyres",
    blurb:
      "How the two compare for UK weather: grip, wear, running costs and what to ask before you switch.",
  },
  {
    title: "Caring for your alloy wheels",
    blurb:
      "Keeping refurbished-looking alloys clean and corrosion-free — the simple routine that makes wheels last.",
  },
];

function NewsPage() {
  return (
    <ContentPage
      chip="News & guides"
      title="News from N2 Wheels"
      intro="Buying guides and updates from the N2 Wheels team. The articles below are samples — full pieces are in production and will appear here."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {SAMPLE_ARTICLES.map((article) => (
          <a
            key={article.title}
            href="#"
            aria-disabled="true"
            className="group flex flex-col rounded-xl border border-white/10 bg-carbon p-5 transition-colors hover:border-race/40"
          >
            <span className="sample-chip">Sample article</span>
            <h2 className="mt-4 text-lg font-bold tracking-tight text-white group-hover:text-race-bright">
              {article.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-steel">{article.blurb}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-steel-dim">
              Coming soon →
            </p>
          </a>
        ))}
      </div>

      <NoteBox title="Nothing is dated or bylined — yet">
        <p>
          We won't publish dates, authors or statistics until real articles exist. When the
          first full guides are ready they'll appear here, properly dated and reviewed.
        </p>
      </NoteBox>
    </ContentPage>
  );
}