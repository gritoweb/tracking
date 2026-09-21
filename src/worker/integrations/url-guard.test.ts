import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithoutRedirect, safeIntegrationOrigin } from "./url-guard";
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
    expect(safeIntegrationOrigin("https://[2606:4700:4700::1111]")).toBe("https://[2606:4700:4700::1111]");
  });

  it.each([
    "[::ffff:127.0.0.1]", // IPv4-mapped loopback
    "[::ffff:7f00:1]",
    "[::ffff:169.254.169.254]", // the cloud metadata address in disguise
    "[::ffff:10.0.0.1]",
    "[::ffff:192.168.1.1]",
    "[::127.0.0.1]", // IPv4-compatible
    "[64:ff9b::7f00:1]", // NAT64
    "[::ffff:0:0]",
    "[2002:7f00:1::]", // 6to4 embeds 127.0.0.1
    "[2001:0:4136:e378:8000:63bf:3fff:fdd2]", // Teredo
    "[2001:db8::1]", // documentation range
    "[ff02::1]", // multicast
    "[fec0::1]", // deprecated site-local
  ])("rejects the IPv6 literal that hides or reserves an address: %s", (host) => {
    expect(() => safeIntegrationOrigin(`https://${host}`)).toThrow(IntegrationError);
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

describe("fetchWithoutRedirect", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks fetch not to follow redirects and returns a normal answer untouched", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithoutRedirect("https://example.com/api", { method: "POST" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api", { method: "POST", redirect: "manual" });
  });

  it("refuses a redirect and names where it pointed", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302, headers: { Location: "https://new.example.com/api" } }));
    await expect(fetchWithoutRedirect("https://old.example.com/api")).rejects.toThrow(/redirected the request to new\.example\.com/);
  });

  it("refuses a redirect to an internal address just the same, without following it", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 307, headers: { Location: "http://169.254.169.254/latest/meta-data" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWithoutRedirect("https://example.com/api")).rejects.toThrow(IntegrationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect that has no readable Location", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 301 }));
    await expect(fetchWithoutRedirect("https://example.com/api")).rejects.toThrow(/redirected the request\./);
  });
});
