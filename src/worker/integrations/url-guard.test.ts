import { describe, expect, it } from "vitest";
import { safeIntegrationOrigin } from "./url-guard";
import { IntegrationError } from "./types";

describe("safeIntegrationOrigin", () => {
  it("accepts a plain public https host and returns its origin", () => {
    expect(safeIntegrationOrigin("https://example.com/api/v1")).toBe("https://example.com");
  });

  it("defaults a scheme-less host to https", () => {
    expect(safeIntegrationOrigin("example.com")).toBe("https://example.com");
  });

  it("rejects an empty base URL", () => {
    expect(() => safeIntegrationOrigin("")).toThrow(IntegrationError);
  });

  it("rejects a non-https scheme", () => {
    expect(() => safeIntegrationOrigin("http://example.com")).toThrow(IntegrationError);
    expect(() => safeIntegrationOrigin("ftp://example.com")).toThrow(IntegrationError);
  });

  it("rejects embedded credentials", () => {
    expect(() => safeIntegrationOrigin("https://user:pass@example.com")).toThrow(IntegrationError);
  });

  it("rejects an unparseable URL", () => {
    expect(() => safeIntegrationOrigin("https://[not-a-host")).toThrow(IntegrationError);
  });

  it.each(["localhost", "sub.localhost", "printer.local", "app.internal", "single-label-host"])(
    "rejects the unsafe hostname %s",
    (host) => {
      expect(() => safeIntegrationOrigin(`https://${host}`)).toThrow(IntegrationError);
    }
  );

  it.each([
    "0.0.0.1",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254", // cloud metadata endpoint
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1", // CGNAT
    "224.0.0.1",
  ])("rejects the private/reserved IPv4 address %s", (ip) => {
    expect(() => safeIntegrationOrigin(`https://${ip}`)).toThrow(IntegrationError);
  });

  it("does not misclassify a public address bordering the private ranges", () => {
    expect(safeIntegrationOrigin("https://172.32.0.1")).toBe("https://172.32.0.1");
    expect(safeIntegrationOrigin("https://172.15.255.255")).toBe("https://172.15.255.255");
    expect(safeIntegrationOrigin("https://8.8.8.8")).toBe("https://8.8.8.8");
  });

  it("rejects a malformed dotted-quad as unsafe rather than letting it slip through", () => {
    expect(() => safeIntegrationOrigin("https://999.1.1.1")).toThrow(IntegrationError);
  });

  it.each(["[::1]", "[::]", "[fc00::1]", "[fe80::1]"])(
    "rejects the unsafe IPv6 literal %s",
    (host) => {
      expect(() => safeIntegrationOrigin(`https://${host}`)).toThrow(IntegrationError);
    }
  );

  it("accepts a public IPv6 literal", () => {
    expect(safeIntegrationOrigin("https://[2001:db8::1]")).toBe("https://[2001:db8::1]");
  });

  it("rejects a DNS-rebinding-looking numeric hostname disguised with dots", () => {
    // A registrable-looking name that is still a raw private IPv4 in disguise.
    expect(() => safeIntegrationOrigin("https://10.0.0.1.")).toThrow(IntegrationError);
  });

  it("pins a Dynamics connection to its own domain", () => {
    expect(safeIntegrationOrigin("https://myorg.dynamics.com", "dynamics")).toBe(
      "https://myorg.dynamics.com"
    );
    expect(() => safeIntegrationOrigin("https://myorg.example.com", "dynamics")).toThrow(IntegrationError);
  });

  it("does not apply the Dynamics restriction to a Workfront connection", () => {
    expect(safeIntegrationOrigin("https://myorg.my.workfront.com", "workfront")).toBe(
      "https://myorg.my.workfront.com"
    );
  });

  it("trims trailing slashes before validating", () => {
    expect(safeIntegrationOrigin("https://example.com///")).toBe("https://example.com");
  });
});
