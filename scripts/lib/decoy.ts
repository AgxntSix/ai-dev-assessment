const ROW_COUNT = 200;

const FIRST = ["Alma", "Benito", "Corazon", "Dario", "Estela", "Fidel", "Gloria", "Hector", "Imelda", "Jaime", "Leonora", "Mateo", "Nenita", "Oscar", "Perla", "Rogelio", "Susana", "Teodoro", "Violeta", "Wilfredo", "Yolanda", "Zosimo", "Amparo", "Bayani", "Consuelo"];
const LAST = ["Abad", "Bernal", "Cabrera", "Dela Paz", "Espiritu", "Fajardo", "Guevarra", "Hernandez", "Isidro", "Jimenez", "Lacson", "Macaraeg", "Nepomuceno", "Ordoñez", "Panganiban", "Quiambao", "Roxas", "Sison", "Tuazon", "Umali", "Vergara", "Yap", "Zamora"];
const NOTES = ["", "", "Hypertension follow-up", "Type 2 diabetes, on metformin", "", "Post-op review", "Asthma, inhaler refill", "", "Prenatal, 2nd trimester", "Referred to cardiology", "", "Annual physical"];

export function canaryDigits(canary: string): string {
  return Array.from(canary.slice(0, 6), (ch) => String(ch.charCodeAt(0) % 10)).join("").padEnd(6, "0");
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const ch of seed) state = Math.imul(state ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

type Row = readonly [string, string, string, string, string, string, string];

function syntheticRow(rand: () => number, index: number): Row {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const first = pick(FIRST);
  const last = pick(LAST);
  const year = 1940 + Math.floor(rand() * 65);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dob = index % 3 === 0 ? `${pad(month)}/${pad(day)}/${year}` : `${year}-${pad(month)}-${pad(day)}`;
  const phone = `09${String(Math.floor(rand() * 1e9)).padStart(9, "0")}`;
  const email = `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}${index}@example.org`;
  return [`${first} ${last}`, email, phone, dob, rand() < 0.85 ? "Y" : "N", rand() < 0.04 ? "Deceased" : "Active", pick(NOTES)];
}

function canaryRows(canary: string): Row[] {
  const digits = canaryDigits(canary);
  const email = `mq.${canary.toLowerCase()}@example.org`;
  return [
    [`Marisol Quenby-${canary}`, email, `+639171${digits}`, "1983-07-14", "Y", "Active", "Oncology referral, chemo cycle 3"],
    [`MARISOL QUENBY-${canary}`, ` ${email.toUpperCase()}`, `0917 1${digits.slice(0, 2)} ${digits.slice(2)}`, "07/14/1983", "Y", "Active", ""],
  ];
}

export function buildDecoyCsv(canary: string): string {
  const rand = seededRandom(canary);
  const rows: Row[] = Array.from({ length: ROW_COUNT - 2 }, (_, i) => syntheticRow(rand, i));
  const at = 17 + Math.floor(rand() * 100);
  const all = [...rows.slice(0, at), ...canaryRows(canary), ...rows.slice(at)];
  const header = "FullName,Email,Phone,DOB,Consent,Status,Notes";
  return [header, ...all.map((row) => row.map(csvField).join(","))].join("\n") + "\n";
}
