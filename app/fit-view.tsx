import type { Fit } from "@/lib/types";

const ROWS: { key: keyof Fit; title: string; titleFi: string; body: keyof Fit; bodyFi: keyof Fit }[] = [
  { key: "whyCompany", title: "Why this company", titleFi: "Miksi tämä yritys", body: "whyCompany", bodyFi: "whyCompanyFi" },
  { key: "whyFit", title: "Why Velho fits", titleFi: "Miksi Velho sopii", body: "whyFit", bodyFi: "whyFitFi" },
  { key: "need", title: "What they need from Velho", titleFi: "Mitä he tarvitsevat", body: "need", bodyFi: "needFi" },
  { key: "showcaseWhy", title: "The example we would show", titleFi: "Esimerkki, jonka näyttäisimme", body: "showcaseWhy", bodyFi: "showcaseWhyFi" },
];

export function FitView({ fit, prospect }: { fit: Fit; prospect?: boolean }) {
  return (
    <div className="stack">
      <p className="meta">
        {prospect ? `Vastaanottaja: ${fit.seatFi}.` : `Seat: ${fit.seat}.`} {fit.showcaseKind}: {fit.showcaseName}.
      </p>
      {ROWS.map((row) => (
        <section key={row.key} className="panel">
          <h2>{prospect ? row.titleFi : row.title}</h2>
          <p lang={prospect ? "fi" : "en"}>{prospect ? fit[row.bodyFi] : fit[row.body]}</p>
          {row.key === "showcaseWhy" ? (
            <p>
              <a href={fit.showcaseUrl}>{fit.showcaseName}</a>
            </p>
          ) : null}
          <p className="meta" lang={prospect ? "en" : "fi"}>
            {prospect ? fit[row.body] : fit[row.bodyFi]}
          </p>
        </section>
      ))}
    </div>
  );
}
