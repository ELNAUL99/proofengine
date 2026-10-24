import type { Refusal } from "@/lib/types";

export function RefusalView({ refusals }: { refusals: Refusal[] }) {
  return (
    <section className="panel refusals">
      <h2>For the room</h2>
      <p className="meta">Three things the sentence leaves out. This is not part of the note.</p>
      {refusals.map((row) => (
        <article key={row.id} className={row.overturned ? "refusal overturned" : "refusal kept"}>
          <h3>{row.overturned ? "Left out" : "Kept"} · {row.title}</h3>
          <p>{row.text}</p>
          <p className="meta" lang="fi">{row.textFi}</p>
        </article>
      ))}
    </section>
  );
}
