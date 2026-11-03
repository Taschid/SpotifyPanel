# SpotifyPanel — build specification

Status: implemented. This document describes the shipped v0.8.6 build, not
future plans. Historical design notes live in `docs/`.

## 1. Summary

A single-file BetterDiscord plugin that docks a Spotify controller to the right
edge of Discord. It talks to the Spotify Web API from the renderer, so there is
no sidecar, native module or bot token. A second, optional path posts music
commands into a Discord channel as the signed-in user.

## 2. Architecture

| Piece | Implementation |
| --- | --- |
| Host | BetterDiscord plugin, `SpotifyPanel.plugin.js` |
| UI | React via `BdApi.React`, one root at `#spotifypanel-root` |
| Styling | one injected `<style>` string, all classes `sp-*` |
| State | React hooks in `App()`; no external store |
| Network | `fetch` to Spotify; `BdApi.Webpack` to reach Discord's message module |
| Persistence | `BdApi.Data` + `SpotifyPanel.config.json` |
| Lifecycle | `start()` / `stop()`; toggled with `Alt+E` |

No Node builtins are required. The loopback auth listener is optional and is
skipped when `require("http")` is unavailable.

## 3. Panel shell

- Fixed to the right edge: `#spotifypanel-panel`, `z-index: 150`,
  `top: 12px`, width `420px`, full height by default.
- Nav row (`.sp-nav`): back button and kebab menu.
- The panel is draggable-free; it resizes from the bottom edge (`.sp-resize`)
  and swallows gestures on its left edge (`.sp-edge`).
- A registry entry `window.__panelRegistry.spotify = { hide }` lets SideChat and
  the other panels hide it, and `hideOtherPanels()` does the same in reverse.
- Narrow mode (`sp-narrow`, width < 360px) trims header controls.

Views: `now` (player), `browse` (library), `queue`, `settings`, `connect`.
Back from `now` opens the library; back elsewhere returns to `now`.

## 4. Authentication

Authorization Code + PKCE (S256), no client secret.

- Redirect URI: `http://127.0.0.1:8899/callback/` (exact, trailing slash).
- Scopes: playback read/modify, current track, playlists, library read/write,
  recently played, playback position, follow read, top read.
- Primary flow: press Connect, approve in the browser; an in-plugin
  `http` listener on `127.0.0.1:8899` captures the code when available.
- Fallback flow: the panel asks for the redirected URL (or a bare code) and
  parses `code`/`state` from it.
- Access token cached in memory, refreshed 60s before expiry; a single `401`
  triggers one refresh and retry.
- Refresh token stored in `SpotifyPanel.config.json` through `BdApi.Data`.
  Tokens are never logged (only `len=N`).

## 5. Spotify Web API surface

| Purpose | Route |
| --- | --- |
| Player state | `GET /me/player` |
| Devices | `GET /me/player/devices` |
| Transfer | `PUT /me/player` |
| Play / pause | `PUT /me/player/play`, `PUT /me/player/pause` |
| Next / previous | `POST /me/player/next`, `POST /me/player/previous` |
| Seek | `PUT /me/player/seek?position_ms=` |
| Volume | `PUT /me/player/volume?volume_percent=` |
| Shuffle / repeat | `PUT /me/player/shuffle`, `PUT /me/player/repeat` |
| Queue | `GET /me/player/queue`, `POST /me/player/queue?uri=` |
| Saved tracks | `GET /me/tracks`, `GET /me/tracks/contains`, `PUT|DELETE /me/tracks` |
| Playlists | `GET /me/playlists`, `GET /playlists/{id}/tracks` |
| Search | `GET /search?type=track` |
| Recent | `GET /me/player/recently-played` |
| Album / artist | `GET /albums/{id}/tracks`, `GET /artists/{id}/top-tracks` |

`204` from `/me/player` is treated as idle. `NO_ACTIVE_DEVICE` triggers a wake
attempt against an available device before the error surfaces.

## 6. State and polling

- Player and devices load every `5000ms`; a `500ms` tick re-renders times.
- Position is interpolated locally: `progress_ms + (now - fetchedAt)`, clamped
  to the track duration.
- Transport actions are optimistic and reconciled by the next poll.
- Polling stops when the plugin stops.

## 7. UI specification

### 7.1 Now Playing (`view === "now"`)

Single column, full panel width:

1. Album art (square, up to the available height, `artSize` computed from the
   panel box minus a `392px` chrome budget).
2. `.sp-info` row: shuffle, title/artist block, repeat.
3. `.sp-progress-row`: elapsed time, draggable seek input (`.sp-seek`), total
   time. The rail is a 3px green/gray gradient with an 11px thumb.
4. `.sp-controls`: like, previous, play/pause circle, next, send-to-chat.
5. `.sp-volume-row`: mute button, volume slider, percentage.

Seek behaviour: drag updates the thumb immediately, debounces `seek` by `180ms`
and holds the drawn position for `1400ms` so the next poll cannot snap it back.
Volume follows the same debounce pattern.

### 7.2 Compact bottom bar (`.sp-mini`, 64px)

Shown at the bottom of library, queue, connect and settings views:

- 32px green circular play/pause button.
- `Artist – Title` in bold/regular, ellipsised.
- Chevron button that opens the library at Playlists.
- Clicking the bar opens Now Playing.
- No progress strip; track progress lives on the Now Playing scrubber.

### 7.3 Library (`view === "browse"`)

- Permanent search field; results replace the list until cleared.
- Tabs: Playlists, Songs, Recent.
- Rows: 28px art, name, subtitle, play on click, `+` to queue.
- Playlist detail: back row, "Play on this device" button, track rows.
- Lazy loading per tab, cached in `lists`, with per-tab error copy.

### 7.4 Queue (`view === "queue"`)

Now playing plus up to 30 upcoming rows; clicking plays that index in the queue
context, `+` re-queues. Refresh reloads the queue.

### 7.5 Settings and connect

- Connection status, Client ID field, Connect / restart login, paste-redirect
  finish field, manual refresh-token entry, disconnect.
- Discord section: music channel id (with "use current channel"), bot profile,
  prefix, per-action template editor with preview, reset.
- Panel size and hotkey are in BetterDiscord's plugin settings.

### 7.6 Command sheet

Right-clicking Send opens a modal sheet: current track, profile name, command
preview, and one row per action with its exact command. Unsupported actions are
hidden. A "Custom command..." row posts raw text.

## 8. Discord bot bridge

- Sends as the signed-in user through `BdApi.Webpack`
  (`getByKeys("sendMessage","receiveMessage")` first, then props, then a scan).
- Left-click Send posts the play command for the current track.
- Templates support `{prefix}`, `{query}`, `{title}`, `{artist}`, `{artists}`,
  `{album}`, `{url}`, `{uri}`; unknown tokens are left intact.
- `{query}` is track name followed by all artist names.
- Profiles: Jockie (`m!`), JMusicBot (`!`), MusicBot (`!`), Custom.
- Actions: play, pause, resume, skip, previous, repeat, shuffle, queue,
  now playing, stop.
- Sends are serialised through `_sendChain` so rapid clicks keep their order.

## 9. Settings keys

| Key | Default | Meaning |
| --- | --- | --- |
| `refreshToken` | `""` | Spotify refresh token |
| `clientId` | `""` | user's Spotify app id |
| `scope` | `""` | granted scopes |
| `musicChannelId` | `""` | target Discord channel |
| `musicBotId` | `"jockie"` | bot profile |
| `musicBotPrefix` | `""` | prefix override |
| `musicBotCommands` | `{}` | per-action template overrides |
| `width` | `420` | panel width |
| `height` | `330` | panel height when not full-height |
| `fullHeight` | `true` | stretch to the viewport |
| `visible` | `true` | panel shown |
| `hotkey` | `["Alt","e"]` | toggle hotkey |
| `titlebarClearance` | `146` | reserved titlebar space |
| `topOffset` | `12` | top gap |
| `volume` | `60` | initial volume |

## 10. Files

| Path | Role |
| --- | --- |
| `SpotifyPanel.plugin.js` | the whole plugin |
| `SpotifyPanel.config.json` | BetterDiscord data store (not in git) |
| `screenshots/` | README images |
| `docs/` | historical build log, scope, bot and transport specs |
| `tests/SpotifyPanel.lifecycle-test.js` | headless harness |

## 11. Tests

`node tests/SpotifyPanel.lifecycle-test.js` runs a stubbed `BdApi` + `fetch`
suite covering lifecycle, PKCE, auth, API mapping, bot profiles and templates,
settings parsing and the send queue. It must pass offline.

## 12. Known issues

- **Send chain can wedge.** `enqueueMusicSend` serialises sends behind
  `_sendChain`, and `deliverMusicMessage` awaits Discord's `sendMessage` promise
  with no timeout. If that promise never settles (seen during an account
  switch), every later Send click waits forever and shows no error. A reload
  clears it. Fix pending: bound the send with a timeout and reset the chain.
- Playback control needs Spotify Premium; free accounts get
  `403 PREMIUM_REQUIRED`.
- Private sessions and local files are not exposed reliably by the Web API.
- The loopback login listener only works where `require("http")` is available in
  the renderer; the paste flow is the fallback.

## 13. Version history

| Version | Change |
| --- | --- |
| 0.8.6 | Compact bottom bar restored; docked player clone removed; seek rail no longer paints the theme's white input fill; pinned to 3px. |
| 0.8.5 | Seek slider between the times; shared player tree; mini progress strip removed. |
| 0.8.0 | Selectable Discord music bot profiles, command sheet, template editor. |
| 0.7.0 | Bring-your-own Spotify app, PKCE, paste fallback. |
| 0.6.x | Music-channel send, previous/next fixes, back-button stack. |
| 0.5.0 | Library tabs, queue, mini player, device pills. |
| 0.4.0 | Modern player layout, resize, theme-matched shell. |
