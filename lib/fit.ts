import type { CompanyCandidate, Finding, Fit } from "./types";

const OUTREACH = /outreach|prospecting|lead gen|liidi|myynti|asiakashank|sähköpostikampanj|cold email|outbound|prospekto/i;

function lead(findings: Finding[]): Finding | null {
  return findings.find((finding) => finding.kind === "process") || findings[0] || null;
}

function place(company: CompanyCandidate): string {
  return [company.industry, company.city].filter(Boolean).join(", ");
}

export function buildFit(company: CompanyCandidate, findings: Finding[]): Fit | null {
  const finding = lead(findings);
  const item = finding?.evidence[0];
  if (!finding || !item) return null;

  const where = place(company);
  const outreach = OUTREACH.test(`${item.jobTitle} ${item.quote}`);
  const tool = finding.kind === "tool";

  const whyCompany = `${company.name} (${company.businessId}${where ? `, ${where}` : ""}) is hiring for “${item.jobTitle}”${item.posted ? `, posted ${item.posted}` : ""}. The ad says: “${item.quote}” That public sentence is the reason to talk to them now.`;
  const whyCompanyFi = `${company.name} (${company.businessId}${where ? `, ${where}` : ""}) hakee rooliin «${item.jobTitle}»${item.posted ? `, ilmoitus ${item.posted}` : ""}. Ilmoituksessa lukee: «${item.quote}» Julkinen lause on syy puhua heille nyt.`;

  if (outreach) {
    return {
      seat: "Whoever owns outbound",
      seatFi: "Sille, joka omistaa uusasiakashankinnan",
      whyCompany,
      whyCompanyFi,
      whyFit:
        "Velho’s published client work is an outbound system: find the companies, read the public signals, and prepare the message for a person to send. This ad describes that work.",
      whyFitFi:
        "Velhon julkaistu asiakastyö on outbound-järjestelmä: löytää yritykset, lukea julkiset signaalit ja valmistella viesti ihmisen lähetettäväksi. Tämä ilmoitus kuvaa sitä työtä.",
      need: "A repeatable way to research accounts and draft the first note, with a person checking it before it goes out. Not a promise of more volume.",
      needFi:
        "Toistuva tapa tutkia asiakkaat ja luonnostella ensimmäinen viesti, jonka ihminen tarkistaa ennen lähettämistä. Ei lupausta suuremmasta volyymista.",
      showcaseName: "Kreia",
      showcaseUrl: "https://velho.io/work",
      showcaseKind: "Client project, measured result",
      showcaseWhy:
        "Kreia is the example we would show. Velho built prospecting, buyer signals, enrichment and email campaigns into one flow. The published result is 10× average weekly outreach volume compared with Kreia’s previous efforts. We would show it because the ad is about that same work. The 10× is Kreia’s volume, not a forecast for this company.",
      showcaseWhyFi:
        "Kreia on esimerkki, jonka näyttäisimme. Velho kokosi prospektoinnin, ostajasignaalit, rikastuksen ja sähköpostikampanjat yhdeksi ketjuksi. Julkaistu tulos on kymmenkertainen viikoittainen kontaktointivolyymi Kreian aiempaan verrattuna. Näyttäisimme sen, koska ilmoitus kertoo samasta työstä. Kymmenkertainen luku on Kreian volyymi, ei ennuste tälle yritykselle.",
    };
  }

  if (tool) {
    const toolName = finding.id === "powerbi" ? "Power BI" : finding.id === "sheets" ? "spreadsheets" : "Excel";
    const toolNameFi = finding.id === "powerbi" ? "Power BI" : finding.id === "sheets" ? "taulukkolaskenta" : "Excel";
    return {
      seat: "CFO",
      seatFi: "Talousjohtaja",
      whyCompany,
      whyCompanyFi,
      whyFit: `Velho fits where the numbers still live in a file a person maintains. ${toolName === "Excel" ? "An" : "A"} ${toolName} requirement in a finance or control role is that pattern. The ad does not prove the file is the system. It makes the question a fair one for a CFO.`,
      whyFitFi: `Velho sopii sinne, missä luvut elävät yhä tiedostossa, jota ihminen ylläpitää. ${toolNameFi}-vaatimus talouden tai ohjauksen roolissa on se kuvio. Ilmoitus ei todista, että tiedosto on järjestelmä. Se tekee kysymyksestä reilun talousjohtajalle.`,
      need: `A current view that reads the systems they already use and shows what changed, with a person reviewing the exceptions. Not a new ERP, and not a claim that ${toolName} itself is waste.`,
      needFi: `Ajantasainen näkymä, joka lukee järjestelmät joita he jo käyttävät ja näyttää mikä muuttui. Ihminen käsittelee poikkeamat. Ei uutta toiminnanohjausjärjestelmää, eikä väitettä että ${toolNameFi} itsessään olisi hukkaa.`,
      showcaseName: "Management reporting",
      showcaseUrl: "https://velho.io/",
      showcaseKind: "Published example of this kind of work",
      showcaseWhy: `This is the example we would show them. On velho.io, management reporting is described as figures copied from several systems each month, replaced by one current view that flags what changed. We would show it because their ad asks for ${toolName}. It is the same kind of work. It is not a claim that Velho has done this in their industry.`,
      showcaseWhyFi: `Tämän esimerkin näyttäisimme heille. Velho.io kuvaa johtamisen raportoinnin näin: luvut kopioitiin joka kuukausi useasta järjestelmästä, ja tilalle tuli yksi näkymä joka näyttää mikä muuttui. Näyttäisimme sen, koska ilmoitus vaatii ${toolNameFi}. Kyse on samasta työtyypistä. Emme väitä, että Velho olisi tehnyt tämän heidän toimialallaan.`,
    };
  }

  return {
    seat: "COO or head of operations",
    seatFi: "Operatiivinen johto",
    whyCompany,
    whyCompanyFi,
    whyFit:
      "Velho fits where a person is still the link between tools. The ad describes that work in its own words. The fit is the handoff, not a guess about their whole operation.",
    whyFitFi:
      "Velho sopii sinne, missä ihminen on yhä linkki työkalujen välillä. Ilmoitus kuvaa sen työn omin sanoin. Sopivuus on tuo siirto, ei arvaus koko toiminnasta.",
    need: "The information moves without someone retyping it, and a person only handles the exceptions. The first step is the step named in the ad, not a broad transformation.",
    needFi:
      "Tieto liikkuu ilman että joku näpyttelee sen uudelleen, ja ihminen käsittelee vain poikkeamat. Ensimmäinen askel on ilmoituksessa nimetty vaihe, ei laaja muutosohjelma.",
    showcaseName: "Order and shipment automation",
    showcaseUrl: "https://velho.io/work",
    showcaseKind: "Published example of this kind of work",
    showcaseWhy:
      "This is the example we would show. Velho’s published operations work moves shipment updates, orders and invoices between systems so a person stops being the integration. Their ad describes a person carrying the work. Same kind of handoff. It is not a claim we have done this for a company like theirs.",
    showcaseWhyFi:
      "Tämän esimerkin näyttäisimme. Velhon julkaistu operaatiotyö siirtää toimituspäivitykset, tilaukset ja laskut järjestelmien välillä, jotta ihminen ei ole enää se integraatio. Heidän ilmoituksensa kuvaa ihmistä joka kantaa työn. Sama siirto. Emme väitä, että olisimme tehneet tämän kaltaiselle yritykselle.",
  };
}
