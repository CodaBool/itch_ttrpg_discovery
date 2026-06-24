# Collect data locally
> local.mjs uses a local browser to fetch and collect tag results. This is written for Linux chrome flatpak

1. start a chrome `flatpak run com.google.Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp`
2. login to itch in the browser
3. run script `npm run local`