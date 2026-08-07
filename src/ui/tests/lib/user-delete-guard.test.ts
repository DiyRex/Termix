import { describe, expect, it } from "vitest";
import { whyCannotDeleteUser } from "@/lib/user-delete-guard";

describe("whyCannotDeleteUser", () => {
  it("allows deleting an admin while others remain — the bug that blocked this", () => {
    expect(
      whyCannotDeleteUser({
        targetUsername: "devops",
        targetIsAdmin: true,
        currentUsername: "devindu",
        adminCount: 2,
      }),
    ).toBeNull();
  });

  it("protects the last remaining admin", () => {
    expect(
      whyCannotDeleteUser({
        targetUsername: "devops",
        targetIsAdmin: true,
        currentUsername: "someone",
        adminCount: 1,
      }),
    ).toBe("last-admin");
  });

  it("refuses your own account, admin or not", () => {
    expect(
      whyCannotDeleteUser({
        targetUsername: "devindu",
        targetIsAdmin: true,
        currentUsername: "devindu",
        adminCount: 5,
      }),
    ).toBe("self");
    expect(
      whyCannotDeleteUser({
        targetUsername: "devindu",
        targetIsAdmin: false,
        currentUsername: "devindu",
        adminCount: 5,
      }),
    ).toBe("self");
  });

  it("allows deleting an ordinary user even when only one admin exists", () => {
    expect(
      whyCannotDeleteUser({
        targetUsername: "bob",
        targetIsAdmin: false,
        currentUsername: "devindu",
        adminCount: 1,
      }),
    ).toBeNull();
  });

  it("defers to the server when the caller cannot supply the inputs", () => {
    // No adminCount and no currentUsername: better to let the request through
    // and surface the server's answer than to guess a stricter rule.
    expect(
      whyCannotDeleteUser({ targetUsername: "devops", targetIsAdmin: true }),
    ).toBeNull();
  });
});
