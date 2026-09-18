// A person tagged in a comment is stored as @[Name](user:ID): the id is what counts, the name is only a fallback label.
const TOKEN = /@\[([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; userId: string; label: string };

export interface MentionPerson {
  userId: string;
  name: string;
}

/** The text and the mentions of a stored body, in order. */
export function splitMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ type: "text", text: body.slice(last, at) });
    segments.push({ type: "mention", userId: match[2], label: match[1] });
    last = at + match[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

/** Every distinct user id tagged in the body, in order of first appearance. */
export function mentionedIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(TOKEN)) ids.add(match[2]);
  return [...ids];
}

const cleanLabel = (name: string) => name.replace(/[[\]()\r\n]/g, "").trim().slice(0, 80) || "user";

export function mentionToken(name: string, userId: string): string {
  return `@[${cleanLabel(name)}](user:${userId})`;
}

/** The body as a person reads it: every tag becomes "@Name". */
export function mentionsToPlain(body: string): string {
  return splitMentions(body)
    .map((s) => (s.type === "text" ? s.text : `@${s.label}`))
    .join("");
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Typed text → stored body: an "@Name" that matches a person exactly becomes a tag. Longest names first ("Ana Maria" over "Ana"); among equal names the earlier person wins, so pass who was picked ahead of everyone else. */
export function encodeMentions(text: string, people: MentionPerson[]): string {
  let out = text;
  const byLength = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const person of byLength) {
    if (!person.name.trim()) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_@\\]])@${escapeRegex(person.name)}(?![\\p{L}\\p{N}_])`, "gu");
    out = out.replace(pattern, (_all, lead: string) => `${lead}${mentionToken(person.name, person.userId)}`);
  }
  return out;
}

/** Stored body → editable text: every tag becomes "@CurrentName" (its own label when the person is gone). */
export function decodeMentions(body: string, people: MentionPerson[]): string {
  const byId = new Map(people.map((p) => [p.userId, p.name]));
  return splitMentions(body)
    .map((s) => (s.type === "text" ? s.text : `@${byId.get(s.userId) ?? s.label}`))
    .join("");
}

/** The members a stored body tags, in order: what an edit form starts from, so two people with one name stay two people. */
export function taggedPeople(body: string, people: MentionPerson[]): MentionPerson[] {
  const byId = new Map(people.map((p) => [p.userId, p]));
  return mentionedIds(body).flatMap((id) => {
    const person = byId.get(id);
    return person ? [{ userId: person.userId, name: person.name }] : [];
  });
}

interface DocNode {
  type?: string;
  attrs?: { id?: unknown; label?: unknown };
  content?: DocNode[];
}

/** Every person tagged in a description (a tiptap JSON doc; legacy plain text has none), in order, once each. */
export function docMentions(raw: string | null | undefined): { userId: string; label: string }[] {
  if (!raw) return [];
  let doc: DocNode;
  try {
    doc = JSON.parse(raw) as DocNode;
  } catch {
    return [];
  }
  const found = new Map<string, string>();
  const walk = (node: DocNode) => {
    if (node.type === "mention" && typeof node.attrs?.id === "string" && !found.has(node.attrs.id)) {
      found.set(node.attrs.id, typeof node.attrs.label === "string" ? node.attrs.label : node.attrs.id);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return [...found].map(([userId, label]) => ({ userId, label }));
}
