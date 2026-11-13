import { test, expect, chromium } from "@playwright/test";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let context;
let server;
let temporaryDirectory;
const pages = new Map();
const requests = [];
const extensionPath = path.resolve("extension");

const escapeAttribute = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const browserLink = (href) => `<a href="${escapeAttribute(href)}">Open in browser</a>`;
const launchScript = `
  console.log("LAUNCH_ATTEMPTED");
  fetch("/launch-fired");
  location.href = "slack://channel?team=T123&id=C123";
`;
const landing = (links) => `<!doctype html><html><head>
  <script>${launchScript}</script>
  <script src="/launch.js"></script>
  </head><body><main data-qa="ssb_redirect_loading_page">${links}</main></body></html>`;

test.beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "slack-web-test-"));
  const keyPath = path.join(temporaryDirectory, "key.pem");
  const certPath = path.join(temporaryDirectory, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", keyPath, "-out", certPath, "-subj", "/CN=slack-web-test.invalid",
  ], { stdio: "ignore" });
  server = createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (req, res) => {
    const url = `https://${req.headers.host}${req.url}`;
    requests.push(url);
    const fixture = pages.get(url);
    if (req.url === "/launch.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(launchScript);
      return;
    }
    res.writeHead(fixture?.status || 200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...fixture?.headers,
    });
    res.end(fixture?.body || "<!doctype html><title>Unexpected URL</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `127.0.0.1:${server.address().port}`;
  context = await chromium.launchPersistentContext(path.join(temporaryDirectory, "profile"), {
    channel: "chromium",
    executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--host-resolver-rules=MAP *.slack.com ${address}, MAP slack.com ${address}`,
      "--no-proxy-server",
    ],
  });
});

test.afterAll(async () => {
  await context?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test.beforeEach(() => {
  pages.clear();
  requests.length = 0;
});

const cases = [
  ["message", "https://example-team.slack.com/archives/C123/p1700000000000001", "https://example-team.slack.com/messages/C123/p1700000000000001?skip_today=1"],
  ["thread reply", "https://another-team.slack.com/archives/C123/p1700000000000002?thread_ts=1700000000.000001&cid=C123", "https://app.slack.com/client/T123/C123/thread/C123-1700000000.000001?message_ts=1700000000.000002&cid=C123&skip_today=1"],
  ["channel", "https://example-team.slack.com/archives/C123", "https://example-team.slack.com/messages/C123?skip_today=1"],
  ["ssb redirect", "https://example-team.slack.com/ssb/redirect?channel=C123", "https://app.slack.com/client/T123/C123?skip_today=1"],
  ["app redirect", "https://slack.com/app_redirect?team=T123&channel=general", "https://app.slack.com/client/T123/C123?skip_today=1"],
  ["HTTP message", "http://example-team.slack.com/archives/C123/p1700000000000001", "https://example-team.slack.com/messages/C123/p1700000000000001?skip_today=1"],
];

for (const [name, source, target] of cases) {
  test(`${name}: one click follows Slack's exact browser link without running launch scripts`, async () => {
    const secureSource = source.replace(/^http:/, "https:");
    pages.set(secureSource, {
      headers: { "content-security-policy": "script-src 'unsafe-inline' 'self'; connect-src 'self'" },
      body: landing(browserLink(target)),
    });
    pages.set(target, { body: '<!doctype html><h1>Destination</h1><script>window.webClientLoaded = true;</script>' });
    const page = await context.newPage();
    const launches = [];
    const scriptBlocks = [];
    page.on("console", (message) => {
      if (message.text() === "LAUNCH_ATTEMPTED") launches.push(message.text());
      if (message.text().includes("script-src 'none'")) scriptBlocks.push(message.text());
    });
    let launchResponse;
    page.on("response", (response) => {
      if (response.url() === secureSource) launchResponse = response;
    });
    await page.setContent(browserLink(source));
    await page.getByRole("link").click();
    await expect(page).toHaveURL(target);
    await expect(page.getByRole("heading")).toHaveText("Destination");
    expect(await page.evaluate(() => window.webClientLoaded)).toBe(true);
    expect(requests).toContain(secureSource);
    expect(requests).toContain(target);
    expect(requests.some((url) => url.endsWith("/launch.js") || url.endsWith("/launch-fired"))).toBe(false);
    expect(launches).toEqual([]);
    const csp = (await launchResponse.allHeaders())["content-security-policy"];
    expect(csp).toContain("connect-src 'self'");
    // CDP exposes the server's original headers here, before DNR modification.
    // Check the browser's enforcement rather than inferring it from that view.
    expect(scriptBlocks.length).toBeGreaterThan(0);
    await page.close();
  });
}

test("a server redirect continues to the web client without disabling its scripts", async () => {
  const source = "https://example-team.slack.com/archives/C123/p1700000000000001";
  const target = "https://app.slack.com/client/T123/C123/p1700000000000001";
  pages.set(source, { status: 302, headers: { location: target }, body: "" });
  pages.set(target, { body: '<script>window.webClientLoaded = true;</script>' });
  const page = await context.newPage();
  await page.goto(source);
  await expect(page).toHaveURL(target);
  expect(await page.evaluate(() => window.webClientLoaded)).toBe(true);
  await page.close();
});

test("relative and duplicate browser links preserve the query and fragment", async () => {
  const source = "https://example-team.slack.com/archives/C123/p1700000000000002";
  const relative = "/messages/C123/p1700000000000002?thread_ts=1700000000.000001&cid=C123#reply";
  const target = `https://example-team.slack.com${relative}`;
  pages.set(source, { body: landing(browserLink(relative) + browserLink(target)) });
  pages.set(target.split("#")[0], { body: "<h1>Reply</h1>" });
  const page = await context.newPage();
  await page.goto(source);
  await expect(page).toHaveURL(target);
  await expect(page.getByRole("heading")).toHaveText("Reply");
  await page.close();
});

test("unrelated Slack pages keep working", async () => {
  for (const pathname of ["/messages/C123", "/client/T123/C123", "/signin", "/app_redirect_other", "/ssb/redirect_other"]) {
    const url = `https://example-team.slack.com${pathname}`;
    pages.set(url, { body: '<script>window.webClientLoaded = true;</script>' });
    const page = await context.newPage();
    await page.goto(url);
    expect(await page.evaluate(() => window.webClientLoaded)).toBe(true);
    await expect(page.locator("#slack-web-status")).toHaveCount(0);
    await page.close();
  }
});

test("missing, ambiguous and untrusted browser links never select an arbitrary destination", async () => {
  const source = "https://example-team.slack.com/archives/C123/p1700000000000001";
  const candidates = [
    '<a href="https://slack.com/downloads">Download</a>',
    '<a href="https://[">Invalid URL</a>',
    browserLink("https://evil.example/messages/C123"),
    browserLink("https://example-team.slack.com.evil.example/messages/C123"),
    browserLink("https://user:password@example-team.slack.com/messages/C123"),
    browserLink("https://example-team.slack.com:444/messages/C123"),
    browserLink("http://example-team.slack.com/messages/C123"),
    browserLink("https://example-team.slack.com/messages/C123") + browserLink("https://example-team.slack.com/messages/C999"),
    browserLink(source),
  ];
  for (const links of candidates) {
    pages.set(source, { body: landing(links) });
    const page = await context.newPage();
    await page.goto(source);
    await expect(page.getByRole("alert")).toContainText("could not find a unique browser link");
    expect(page.url()).toBe(source);
    await page.close();
  }
});
