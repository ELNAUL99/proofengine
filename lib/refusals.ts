import type { Fit, Guess, Refusal } from "./types";

export const DEFAULT_GUESS = {
  seat: "CEO",
  showcase: "Kreia",
};

export const SEATS = [
  { seat: "CEO", seatFi: "toimitusjohtaja" },
  { seat: "CFO", seatFi: "talousjohtaja" },
  { seat: "COO or head of operations", seatFi: "operatiivinen johto" },
  { seat: "Whoever owns outbound", seatFi: "se, joka omistaa uusasiakashankinnan" },
] as const;

export const SHOWCASES = ["Kreia", "Management reporting", "Order and shipment automation"] as const;

function seatPhrase(seat: string): string {
  if (seat === "CEO" || seat === "CFO") return `the ${seat}`;
  if (seat === "Whoever owns outbound") return "whoever owns outbound";
  return "the COO or head of operations";
}

export function normalizeGuess(input: Partial<Guess> | null | undefined): Guess {
  const seat = SEATS.find((item) => item.seat === input?.seat)?.seat || DEFAULT_GUESS.seat;
  const showcase = SHOWCASES.find((name) => name === input?.showcase) || DEFAULT_GUESS.showcase;
  return { seat, showcase };
}

export function buildRefusals(fit: Fit, guessInput: Partial<Guess> | null | undefined): Refusal[] {
  const guess = normalizeGuess(guessInput);
  const guessed = SEATS.find((item) => item.seat === guess.seat) || SEATS[0];
  const seatOverturned = guess.seat !== fit.seat;
  const showcaseOverturned = guess.showcase !== fit.showcaseName;
  const kreia = guess.showcase === "Kreia";

  const seat: Refusal = seatOverturned
    ? {
        id: "seat",
        overturned: true,
        title: "Seat",
        text: `You would have written to ${seatPhrase(guess.seat)}. The sentence points to ${seatPhrase(fit.seat)}. The note goes there.`,
        textFi: `Arvaus oli ${guessed.seatFi}. Lause osoittaa rooliin «${fit.seatFi}». Muistio menee sinne.`,
      }
    : {
        id: "seat",
        overturned: false,
        title: "Seat",
        text: `The sentence supports ${seatPhrase(fit.seat)}. The note stays with that seat.`,
        textFi: `Lause tukee roolia «${fit.seatFi}». Muistio pysyy siinä.`,
      };

  const showcase: Refusal = showcaseOverturned
    ? {
        id: "showcase",
        overturned: true,
        title: "Example",
        text: kreia
          ? `You would have attached Kreia. Kreia is the outbound example: prospecting, buyer signals, and email. This sentence does not describe that work. The example we would show is ${fit.showcaseName}.`
          : `You would have attached ${guess.showcase}. This sentence does not describe that work. The example we would show is ${fit.showcaseName}.`,
        textFi: kreia
          ? `Olisit liittänyt Kreian. Kreia on outbound-esimerkki: prospektointi, ostajasignaalit ja sähköposti. Tämä lause ei kuvaa sitä työtä. Esimerkki, jonka näyttäisimme, on ${fit.showcaseName}.`
          : `Olisit liittänyt työn «${guess.showcase}». Tämä lause ei kuvaa sitä työtä. Esimerkki, jonka näyttäisimme, on ${fit.showcaseName}.`,
      }
    : {
        id: "showcase",
        overturned: false,
        title: "Example",
        text: `${fit.showcaseName} is the example this sentence earns. The other published examples stay out.`,
        textFi: `${fit.showcaseName} on esimerkki, jonka tämä lause ansaitsee. Muut julkaistut esimerkit jäävät pois.`,
      };

  const cost: Refusal = {
    id: "cost",
    overturned: true,
    title: "Cost",
    text: "The ad states no cost for this work. The note does not invent one.",
    textFi: "Ilmoitus ei kerro tämän työn kustannusta. Muistio ei keksi sitä.",
  };

  return [seat, showcase, cost];
}
