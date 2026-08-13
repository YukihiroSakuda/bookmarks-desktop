# Privacy Policy — Bookmarks & Tags

**Last updated: 2026-08-13**

Bookmarks & Tags ("the app") is a bookmark manager developed by Yukihiro Sakuda. This policy explains what data the app handles and how.

## Summary

The app does not collect, transmit, or store any of your data outside your own device. There are no accounts, no analytics, no ads, and no third-party data sharing.

## What data the app handles

The app stores the following information, all of which you enter yourself:

- Bookmark URLs, titles, tags, and memos
- Tag rules you create
- App settings (sort order, columns, theme, etc.)

## Where data is stored

All data is stored locally in a SQLite database (`bookmarks.db`) on your own computer. It is never uploaded to any server operated by the developer or any third party.

The database file is located at `%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db`, and display preferences such as theme and search history are kept in the app's local WebView2 profile under `%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\`. The Microsoft Store version and the installer version use these same folders.

## Local network use

The desktop app runs a local web server bound to `127.0.0.1` (your own machine only) so that the companion browser extension can save bookmarks to the app. This server:

- Only accepts connections from your own computer — it is not reachable over the internet or your local network
- Only accepts requests from the companion browser extension, using a token generated on your device
- Never sends data anywhere outside your device

## Browser extension

The companion browser extension only communicates with the local server described above (`http://localhost:37373`). It does not access or transmit browsing history, and it does not communicate with any external server.

## Data retention and deletion

Your data remains on your device until you delete it. You can delete individual bookmarks within the app, or remove all data by deleting the local data folders listed above. Note that uninstalling the app — including the Microsoft Store version — does not delete these folders, so delete them manually if you want to erase everything.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised. Continued use of the app after changes constitutes acceptance of the revised policy.

## Contact

Questions about this policy can be sent to: yukihirosakuda@gmail.com
