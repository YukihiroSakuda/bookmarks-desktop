# Privacy Policy — Bookmarks & Tags

**Last updated: 2026-11-18**

Bookmarks & Tags ("the app") is a bookmark manager developed by Yukihiro Sakuda. This policy explains what data the app handles and how.

## Summary

The app does not collect, transmit, or store any of your data outside your own device. There are no accounts, no analytics, no ads, and no third-party data sharing. The only outbound connections the app makes are to the websites you bookmark, as described in "Connecting to the sites you bookmark" below. If you connect an AI assistant to the app yourself (see "AI assistants (MCP)"), that assistant — not the app — sends what it reads to its own service.

## What data the app handles

The app stores the following information, all of which you enter yourself:

- Bookmark URLs, titles, tags, and memos
- Tag rules you create
- App settings (sort order, columns, theme, etc.)

## Where data is stored

All data is stored locally in a SQLite database (`bookmarks.db`) on your own computer. It is never uploaded to any server operated by the developer or any third party.

The database file is located at `%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db`, and display preferences such as theme and search history are kept in the app's local WebView2 profile under `%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\`. The Microsoft Store version and the installer version use these same folders.

## Connecting to the sites you bookmark

When you add a bookmark for a web page, the app requests that page from the site itself — the same request your browser makes when you open it — in order to read its title and its icon (favicon). The icon is then stored in the local database, so displaying your bookmarks afterwards requires no network access at all.

- Only the site you are bookmarking is contacted. No third-party service is involved, and no icon or lookup service ever receives the list of sites you bookmark
- Bookmarks for local files and folders never cause any network request
- Importing bookmarks (HTML or JSON backup) does not contact any site. If you want icons for imported bookmarks, **Settings → Data → Fetch missing icons** requests them from those sites, and only when you press it
- Nothing about these requests is reported back to the developer

## Local network use

The desktop app runs a local web server bound to `127.0.0.1` (your own machine only) so that the companion browser extension can save bookmarks to the app. This server:

- Only accepts connections from your own computer — it is not reachable over the internet or your local network
- Only accepts requests from the companion browser extension, using a token generated on your device
- Never sends data anywhere outside your device

## AI assistants (MCP)

The app can act as an MCP server for AI assistants such as Claude Desktop or Claude Code. This is off unless you set it up: nothing happens until you add the app to an assistant's configuration yourself (**Settings → AI assistants** shows how).

- The assistant starts the app's executable with `--mcp` on your computer and talks to it over standard input/output. No network port is opened and the app makes no network connection for this
- It is read-only: the database is opened in read-only mode, so an assistant cannot change, add, or delete your bookmarks
- It can read bookmark titles, URLs and file paths, tags, memos, usage counts and dates, and the names of files and folders inside folders you have bookmarked. It does not read the contents of those files
- What the assistant reads is sent to the AI service that assistant uses and is handled under that service's own privacy policy. The developer of this app receives none of it
- To stop, remove the app from the assistant's configuration

## Browser extension

The companion browser extension only communicates with the local server described above (`http://localhost:37373`). It does not access or transmit browsing history, and it does not communicate with any external server.

## Data retention and deletion

Your data remains on your device until you delete it. You can delete individual bookmarks within the app, or remove all data by deleting the local data folders listed above. Note that uninstalling the app — including the Microsoft Store version — does not delete these folders, so delete them manually if you want to erase everything.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised. Continued use of the app after changes constitutes acceptance of the revised policy.

## Contact

Questions about this policy can be sent to: yukihirosakuda@gmail.com
