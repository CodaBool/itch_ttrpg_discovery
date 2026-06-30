# Collect data locally
> local.mjs uses a local browser to fetch and collect tag results. This is written for Linux chrome flatpak

1. start chrome with a persistent profile directory (keeps your itch login cookie across runs):
	`flatpak run com.google.Chrome --remote-debugging-port=9222 --user-data-dir=$HOME/.config/itch-rpg-feed/chrome-cdp`
	a. Windows: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\ChromeDebug"`
2. login to itch in the browser
3. run script `npm run local`

## Detail scrape notes

- Run detail scraper: `npm run detail`
- The script now supports stronger recovery for dropped Chrome/CDP sessions.

Optional env vars for detail runs:

- `DETAIL_PROTOCOL_TIMEOUT_MS` default `120000`
- `DETAIL_TAB_RECYCLE_EVERY` default `120`
- `DETAIL_AUTO_LAUNCH_CHROME` default `false`
- `DETAIL_CHROME_LAUNCH_WAIT_MS` default `30000`
- `DETAIL_CHROME_PROFILE_DIR` default `$HOME/.config/itch-rpg-feed/chrome-cdp`

Example auto-launch run (uses persistent profile and starts Chrome if CDP is unavailable):

`DETAIL_AUTO_LAUNCH_CHROME=true DETAIL_CHROME_PROFILE_DIR=$HOME/.config/itch-rpg-feed/chrome-cdp npm run detail`