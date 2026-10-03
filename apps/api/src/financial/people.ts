import { prisma } from "../db/client";
import { normalizeText } from "./keywords";

// "minha esposa", "o Pedro", "do filho" → drop the little words around the name.
const FILLER = new Set(["meu", "minha", "meus", "minhas", "o", "a", "os", "as", "do", "da", "de", "dos", "das", "pro", "pra", "pelo", "pela", "para", "com"]);

// Words that mean the owner themself or nobody in particular — never a person.
const NOT_A_PERSON = new Set(["eu", "mim", "me", "proprio", "propria", "voce", "vc", "gente", "todos", "ninguem", "alguem", "pessoa", "casa", "familia"]);

// Different ways to say the same relation, so "mulher" finds the person saved as "esposa".
const RELATION_GROUPS = [
  ["esposa", "mulher", "senhora"],
  ["marido", "esposo"],
  ["namorada"],
  ["namorado"],
  ["filho"],
  ["filha"],
  ["mae", "mamae"],
  ["pai", "papai"],
  ["irmao"],
  ["irma"],
  ["avo", "vovo", "avos"],
  ["sogro"],
  ["sogra"],
  ["neto"],
  ["neta"],
  ["tio"],
  ["tia"],
  ["primo"],
  ["prima"],
];

const canonicalRelation = (word: string): string | null => {
  const n = normalizeText(word);
  return RELATION_GROUPS.find((g) => g.includes(n))?.[0] ?? null;
};

// How a relation reads as a name ("mae" → "Mãe"); everything else keeps what the user typed.
const RELATION_DISPLAY: Record<string, string> = {
  esposa: "Esposa", marido: "Marido", namorada: "Namorada", namorado: "Namorado", filho: "Filho", filha: "Filha",
  mae: "Mãe", pai: "Pai", irmao: "Irmão", irma: "Irmã", avo: "Avó", sogro: "Sogro", sogra: "Sogra",
  neto: "Neto", neta: "Neta", tio: "Tio", tia: "Tia", primo: "Primo", prima: "Prima",
};

/** The mention minus the little words, with the user's own accents and spelling kept (for display). */
function displayMention(mention: string): string {
  return mention
    .trim()
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(normalizeText(w)))
    .join(" ");
}

/** A relation as it should read back to the user ("mae" → "mãe"), whatever spelling it was saved in. */
export function relationLabel(relation: string | null): string | null {
  if (!relation) return null;
  const canonical = canonicalRelation(relation);
  return canonical ? RELATION_DISPLAY[canonical].toLowerCase() : relation;
}

function cleanMention(mention: string): string {
  return normalizeText(mention)
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
}

const titleCase = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");

export async function listPeople(workspaceId: string) {
  return prisma.person.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

/**
 * The person a mention refers to: by full name, by first name (or any name
 * word), or by relation ("minha esposa" → the person saved as esposa).
 * Null when nobody matches — the caller decides whether to create one.
 */
export async function findPerson(mention: string, workspaceId: string) {
  const needle = cleanMention(mention);
  if (!needle || NOT_A_PERSON.has(needle)) return null;

  const people = await listPeople(workspaceId);
  const nameOf = (p: { name: string }) => normalizeText(p.name);

  const exact = people.find((p) => nameOf(p) === needle);
  if (exact) return exact;

  // "Marília" for "Marília Izabele": the mention is one of the name's words.
  const byWord = people.filter((p) => needle.length >= 3 && nameOf(p).split(" ").includes(needle));
  if (byWord.length === 1) return byWord[0];

  const relation = canonicalRelation(needle);
  if (relation) {
    const byRelation = people.filter((p) => p.relation && canonicalRelation(p.relation) === relation);
    if (byRelation.length === 1) return byRelation[0];
  }

  // A longer mention that contains a saved name ("o presente da Marília").
  const contained = people.filter((p) => nameOf(p).length >= 3 && ` ${needle} `.includes(` ${nameOf(p)} `));
  return contained.length === 1 ? contained[0] : null;
}

/**
 * Finds the person, or creates one when the mention is a name or relation
 * nobody has used yet. `created` tells the reply to say so, since an
 * automatic creation is exactly what the user should be able to catch.
 */
export async function resolvePerson(mention: string, relation: string | null, workspaceId: string) {
  const found = await findPerson(mention, workspaceId);
  if (found) return { person: found, created: false };

  const cleaned = cleanMention(mention);
  if (cleaned.length < 2 || cleaned.length > 40 || NOT_A_PERSON.has(cleaned) || !/\p{L}/u.test(cleaned)) return null;

  const canonical = canonicalRelation(cleaned);
  const name = canonical ? RELATION_DISPLAY[canonical] : titleCase(displayMention(mention));
  // Kept as typed (with accents) because it is shown back to the user; matching normalizes it on the fly.
  const ownRelation = relation ? relation.trim().toLowerCase() : canonical ? RELATION_DISPLAY[canonical].toLowerCase() : null;
  const person = await prisma.person.upsert({
    where: { workspaceId_name: { workspaceId, name } },
    create: { workspaceId, name, relation: ownRelation },
    update: {},
  });
  return { person, created: true };
}
