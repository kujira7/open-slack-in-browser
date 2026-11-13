(() => {
  // Match the response-header rule: content-script match patterns are broader.
  const launchPath = /^\/(?:archives\/[^?#]*|ssb\/redirect\/?|app_redirect\/?)$/;
  if (!launchPath.test(location.pathname)) return;

  const destinations = new Set();
  for (const link of document.querySelectorAll("a[href]")) {
    let url;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) continue;

    const isWorkspaceBrowserLink =
      /^[a-z0-9-]+\.slack\.com$/.test(url.hostname) &&
      url.pathname.startsWith("/messages/");
    const isWebClientLink =
      url.hostname === "app.slack.com" && url.pathname.startsWith("/client/");

    if (isWorkspaceBrowserLink || isWebClientLink) destinations.add(url.href);
  }

  if (destinations.size === 1) {
    // Use the actual destination supplied by Slack, including all query fields.
    // Do not construct a message URL or select an arbitrary Slack homepage.
    location.replace([...destinations][0]);
    return;
  }

  // The launch page's scripts are blocked. Make a changed/missing browser link
  // visible instead of leaving the user watching an indefinite loading screen.
  const notice = document.createElement("p");
  notice.id = "open-slack-in-browser-status";
  notice.setAttribute("role", "alert");
  notice.textContent =
    "Open Slack in Browser could not find a unique browser link on this page. " +
    "Disable this extension and reload to use Slack's normal sign-in or navigation.";
  (document.body || document.documentElement).prepend(notice);
})();
