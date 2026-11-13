# Privacy

Slack Web reads anchor URLs on supported Slack launch pages to find Slack's
browser destination. It navigates the same tab to that URL.

The extension does not collect, retain, or transmit message content, credentials,
cookies, browsing history, or analytics. It has no storage permission, background
service, external API calls, remote code, or telemetry. Navigating to Slack still
makes normal browser requests to Slack, using your browser's existing session.

## Permissions

- `declarativeNetRequestWithHostAccess`: upgrade HTTP launch links to HTTPS and
  add a script restriction to supported launch-page responses before they run.
- `http://*.slack.com/*` and `https://*.slack.com/*`: apply those rules across
  Slack workspaces and read the launch page's browser link. Chrome host grants
  apply to the whole host, but the rules and content scripts are path-scoped.

The extension does not change Windows protocol associations or reset any site
permissions. Disable or uninstall it to remove its behavior.
