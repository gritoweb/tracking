import { describe, expect, it } from "vitest";
import { decodeMentions, encodeMentions, mentionedIds, mentionsToPlain, mentionToken, splitMentions, taggedPeople } from "./mentions";

const luis = { userId: "u-luis", name: "Luis GritoWeb" };
const ana = { userId: "u-ana", name: "Ana" };
const anaMaria = { userId: "u-am", name: "Ana Maria" };

describe("mention tokens", () => {
  it("splits a body into text and mentions in order", () => {
    expect(splitMentions("oi @[Luis](user:u-luis), veja isto")).toEqual([
      { type: "text", text: "oi " },
      { type: "mention", userId: "u-luis", label: "Luis" },
      { type: "text", text: ", veja isto" },
    ]);
  });

  it("lists each tagged id once, in order", () => {
    expect(mentionedIds("@[A](user:a) e @[B](user:b) e de novo @[A](user:a)")).toEqual(["a", "b"]);
    expect(mentionedIds("no tags here")).toEqual([]);
  });

  it("reads a body as plain text", () => {
    expect(mentionsToPlain("oi @[Luis](user:u-luis)!")).toBe("oi @Luis!");
  });

  it("never lets a name break out of its own tag", () => {
    const token = mentionToken("Bob](user:evil) @[X", "u-bob");
    expect(token).toBe("@[Bobuser:evil @X](user:u-bob)");
    expect(mentionedIds(token)).toEqual(["u-bob"]);
  });

  it("ignores a tag with an id that could carry more than an id", () => {
    expect(mentionedIds("@[X](user:a b)")).toEqual([]);
    expect(mentionedIds("@[X](user:a)b)")).toEqual(["a"]);
  });
});

describe("encodeMentions", () => {
  it("turns an exact @Name into a tag and leaves the rest alone", () => {
    expect(encodeMentions("oi @Luis GritoWeb, bom dia", [luis])).toBe("oi @[Luis GritoWeb](user:u-luis), bom dia");
    expect(encodeMentions("sem ninguém", [luis])).toBe("sem ninguém");
  });

  it("prefers the longest name", () => {
    expect(encodeMentions("@Ana Maria e @Ana", [ana, anaMaria])).toBe("@[Ana Maria](user:u-am) e @[Ana](user:u-ana)");
  });

  it("does not tag inside a word or an email", () => {
    expect(encodeMentions("mail ana@Ana.com", [ana])).toBe("mail ana@Ana.com");
    expect(encodeMentions("@Anabela", [ana])).toBe("@Anabela");
  });

  it("copes with names that contain regex characters", () => {
    const odd = { userId: "u-x", name: "J. (Zé)" };
    expect(encodeMentions("oi @J. (Zé)!", [odd])).toBe("oi @[J. Zé](user:u-x)!");
  });

  it("does not tag twice when run again on its own output", () => {
    const once = encodeMentions("@Ana", [ana]);
    expect(encodeMentions(once, [ana])).toBe(once);
  });
});

describe("decodeMentions", () => {
  it("shows the current name, falling back to the stored label", () => {
    expect(decodeMentions("oi @[Old](user:u-luis)", [luis])).toBe("oi @Luis GritoWeb");
    expect(decodeMentions("oi @[Gone](user:u-gone)", [luis])).toBe("oi @Gone");
  });

  it("round-trips with encodeMentions", () => {
    const body = "@[Luis GritoWeb](user:u-luis) veja com @[Ana](user:u-ana)";
    expect(encodeMentions(decodeMentions(body, [luis, ana]), [luis, ana])).toBe(body);
  });
});

describe("two people with the same name", () => {
  const first = { userId: "u-1", name: "Demo User" };
  const second = { userId: "u-2", name: "Demo User" };

  it("tags the one listed first, so the person picked must come ahead of everyone", () => {
    expect(encodeMentions("oi @Demo User", [second, first])).toBe("oi @[Demo User](user:u-2)");
    expect(encodeMentions("oi @Demo User", [first, second])).toBe("oi @[Demo User](user:u-1)");
  });

  it("starts an edit from the people the body already tags", () => {
    const body = "oi @[Demo User](user:u-2)";
    expect(taggedPeople(body, [first, second])).toEqual([second]);
    expect(encodeMentions(decodeMentions(body, [first, second]), [...taggedPeople(body, [first, second]), first, second])).toBe(body);
  });

  it("skips a tagged person who is no longer a member", () => {
    expect(taggedPeople("@[Gone](user:u-gone)", [first])).toEqual([]);
  });
});
