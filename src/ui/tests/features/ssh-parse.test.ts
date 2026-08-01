import { describe, it, expect } from "vitest";
import { parseSshTarget } from "@/lib/ssh-target";

describe("parseSshTarget", () => {
  it("parses the form from the connect bar's placeholder", () => {
    expect(parseSshTarget("ssh USER@124.243.213.1")).toEqual({
      username: "USER",
      ip: "124.243.213.1",
      port: 22,
    });
  });

  it("accepts user@host without the ssh prefix", () => {
    expect(parseSshTarget("devin@example.com")).toEqual({
      username: "devin",
      ip: "example.com",
      port: 22,
    });
  });

  it("accepts a bare host", () => {
    expect(parseSshTarget("10.0.0.5")).toEqual({
      username: "",
      ip: "10.0.0.5",
      port: 22,
    });
  });

  it("reads host:port", () => {
    expect(parseSshTarget("ssh root@box.local:2222")).toEqual({
      username: "root",
      ip: "box.local",
      port: 2222,
    });
  });

  it("reads -p port", () => {
    expect(parseSshTarget("ssh -p 2200 root@box")).toEqual({
      username: "root",
      ip: "box",
      port: 2200,
    });
  });

  it("rejects free-text searches so CONNECT stays disabled", () => {
    expect(parseSshTarget("k8s")).not.toBeNull(); // a bare word is a valid hostname
    expect(parseSshTarget("")).toBeNull();
    expect(parseSshTarget("   ")).toBeNull();
    expect(parseSshTarget("...")).toBeNull();
    expect(parseSshTarget("my prod box")).toBeNull();
  });

  it("rejects an out-of-range port rather than guessing", () => {
    // The colon is left in place when the port is invalid, and the hostname
    // check then refuses it — better than silently connecting to "host".
    expect(parseSshTarget("host:99999")).toBeNull();
    expect(parseSshTarget("ssh -p 70000 host")).toBeNull();
  });

  it("does not mangle an IPv6 literal into a port", () => {
    expect(parseSshTarget("fe80::1")).toBeNull();
  });
});
