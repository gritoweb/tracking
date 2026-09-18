import { describe, expect, it } from "vitest";
import { filterMembers } from "./mentionSearch";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const person = (userId: string, name: string, email = `${userId}@x.test`): WorkspaceMember => ({ userId, name, email, image: null, role: "member" });
const team = [person("1", "Luis GritoWeb"), person("2", "José Álvaro"), person("3", "Ana"), person("4", "Ana Maria")];

describe("filterMembers", () => {
  it("matches on part of a name, ignoring case", () => {
    expect(filterMembers(team, "lu").map((m) => m.userId)).toEqual(["1"]);
  });

  it("ignores accents in both directions", () => {
    expect(filterMembers(team, "jose").map((m) => m.userId)).toEqual(["2"]);
    expect(filterMembers(team, "álv").map((m) => m.userId)).toEqual(["2"]);
  });

  it("matches on e-mail and lists everyone for an empty query", () => {
    expect(filterMembers(team, "3@x").map((m) => m.userId)).toEqual(["3"]);
    expect(filterMembers(team, "")).toHaveLength(4);
  });

  it("lists a person once and stops at the limit", () => {
    expect(filterMembers([team[0], team[0]], "lu")).toHaveLength(1);
    const many = Array.from({ length: 20 }, (_, i) => person(String(i), `Member ${i}`));
    expect(filterMembers(many, "member", 3)).toHaveLength(3);
  });
});
