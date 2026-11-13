# Open Slack in Browser

Open Slack message and channel links in your browser with one click.

An unofficial Chrome Manifest V3 extension. No configuration, account, build step,
or runtime dependencies. Not affiliated with Slack or Salesforce.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose this project's **`extension`** directory.
3. Allow the extension to run on the Slack workspaces you use.
4. Disable or uninstall **Open Slack in Browser, not App**, earlier versions of
   Open Slack in Browser, and other rules that redirect the same Slack links.
5. Click a Slack message or channel link from another page.

Keep the extension directory in place. After updating its files, click **Reload**
on the extension card. Disable or remove the extension to restore normal Slack
navigation; no Windows settings or existing site permissions need resetting.

## Supported links

| Input | Behavior |
| --- | --- |
| `https://<workspace>.slack.com/archives/<channel>/<message>` | Follow Slack's browser link for the message, including thread replies. |
| `https://<workspace>.slack.com/archives/<channel>` | Follow Slack's browser link for the channel. |
| `https://<workspace>.slack.com/ssb/redirect?...` | Follow the browser link supplied by the launch page. |
| `https://slack.com/app_redirect?...` (also workspace hosts) | Let Slack resolve the target, then follow its browser link. |
| HTTP versions of these links | Upgrade to HTTPS first. |
| Existing `/messages/…` and `app.slack.com/client/…` links | Leave them unchanged. |

The extension does **not** replace `/archives/` with `/messages/`, construct IDs,
or guess where an app/channel name should lead. It follows the actual HTTPS link
Slack includes in the page, preserving its full path, query, and fragment. That
link must point to a Slack workspace's `/messages/…` path or
`https://app.slack.com/client/…`. Multiple copies of the same link are fine;
multiple different destinations produce an error instead of choosing one.

## How it avoids the desktop-app prompt

For the launch-page paths above, a static `declarativeNetRequest` rule appends
`Content-Security-Policy: script-src 'none'` to the main document's response.
This prevents the page's inline and external launch scripts from executing.
It adds a restriction without replacing Slack's existing security policy.

An isolated content script then reads the server-rendered browser link and
navigates to it with `location.replace`. It runs independently of the page's
scripts. No click-handler timing race or background service worker is needed.
The destination web client and sign-in paths are outside the rule and can run
their scripts normally. HTTP server redirects are also followed normally.

## Limits and verification status

- You still need to be signed in and have access to the conversation. The
  extension does not bypass authentication, workspace membership, or retention.
- This depends on Slack serving a browser link in the launch-page HTML. If
  Slack changes that page, requires page JavaScript to generate the link, or
  serves a sign-in/client UI directly at a launch-page path, the extension may
  show an error or prevent that page from working. Disable it and reload in that
  case. It does not silently fall back to a homepage or a guessed channel.
- Native `slack://` links opened directly by Windows are outside Chrome's HTTP
  navigation and are not intercepted. This is not a system-wide app blocker.
- Custom domains and GovSlack domains other than `slack.com` are not covered.
- Chromium integration tests pass against a **local HTTPS fixture server** with
  the real extension installed. They cover one-click navigation, message/thread
  query preservation, launch-script suppression, server redirects, unaffected
  web-client pages, and missing/ambiguous/untrusted links.
- **Live, signed-in Slack acceptance is pending.** The fixture tests do not prove
  Slack's current HTML or message rendering. Before treating a release as ready,
  test a normal message, a specific thread reply, a channel, and both redirect
  forms in a signed-in browser. Compare the destination to Slack's own
  “open in browser” link and verify the actual message/reply, not just the channel.
  Check that no desktop-app prompt appears, including the first link after a
  fresh browser start.

## Development

Use Node.js 22 or later and OpenSSL. Only development tests need npm packages.

```sh
npm ci
npx playwright install chromium
npm test
```

To use an already-installed Chromium binary:

```sh
PW_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm test
```

Tests create a temporary browser profile and a one-day self-signed test
certificate. Slack test hostnames resolve to the local HTTPS fixture server;
no Slack credentials or real messages are used. Test profiles and keys are
removed afterward. No real workspace identifiers belong in fixtures or issues.

Load or distribute only `extension/`. Tests, development dependencies and test
results are not part of the installed extension.

## Privacy and permissions

See [PRIVACY.md](PRIVACY.md). The extension has no analytics, storage, background
requests, credentials, or remote code. Site access is limited to `slack.com` and
its subdomains; execution is limited to the launch-page paths listed above.

## References

- [Slack message permalinks](https://docs.slack.dev/reference/methods/chat.getPermalink/)
- [Chrome declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Chrome isolated content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

## License

[MIT](LICENSE).
