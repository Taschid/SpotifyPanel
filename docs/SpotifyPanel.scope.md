# Spotify panel: scope and technical plan

Status: **scoping only**, nothing implemented.
Companion to `SideChat.build.md`. Same target: Discord PTB 1.0.1226, BetterDiscord,
system24 theme, Windows.

Goal: a second docked side panel, visually identical to SideChat, that shows what
is playing on Spotify and lets you control playback without leaving Discord.

---

## 1. Scope

### In

- Now playing: album art, track, artists, album, progress bar with seek.
- Transport: play/pause, next, previous, shuffle, repeat, volume.
- Device picker + transfer playback (desktop app, phone, speaker).
- Deep link "Open in Spotify" (`spotify:track:...` via `shell.openExternal`).
- Hotkey toggle (proposed `Alt+M`), close, resize, persisted width/state.
- Opaque, theme-matched panel with its own `spotify` label, white hover outline,
  12px gaps, z-index 150 band.

### Out (for v1)

- Search, playlist browsing, library management, queue editing.
- Lyrics, podcast/video playback.
- Any DRM/audio routing inside Discord (no Web Playback SDK; that streams audio
  from the browser and would fight the desktop app for the device).
- Multi-account support.

### Hard constraint

Spotify's Web API refuses playback commands (`403 PREMIUM_REQUIRED`) for free
accounts. The panel must degrade to read-only display for non-Premium users.

## 2. Where the data can come from

### A. Discord presence (no auth, read-only)

Discord already mirrors the user's Spotify activity into `PresenceStore`
(`getActivities(userId)` → activity `type 2` with `name: "Spotify"`, `details`
(track), `state` (artists), `assets.large_image` = `spotify:<image id>`,
`timestamps.start/end`, `sync_id` = track id).

- Cost: ~30 lines, works immediately, no tokens.
- Gives: track/artist/art/progress, plus what friends are playing.
- Cannot: pause, seek, change track. Useless for a "controller".

Use it as the **fallback renderer** when no Spotify token exists, so the panel is
never empty and never needs a browser login just to look at.

### B. Spotify Web API with PKCE (chosen path)

- Auth: Authorization Code + PKCE. Scopes:
  `user-read-playback-state user-modify-playback-state user-read-currently-playing`.
- Requires the user to create one Spotify app in the developer dashboard
  (2 minutes, one time) and paste its Client ID into plugin settings.
- Redirect URI must be registered exactly. Loopback
  (`http://127.0.0.1:<port>/callback`) is the only redirect that works without
  hosting a page.
- Then: access token (1h) + refresh token (long-lived, revocable).

### C. Local Spotify client ("Connect" internals)

The desktop app's own token store (e.g. `sp_dc` cookie → `open.spotify.com/get_access_token`)
works but is undocumented, breaks on updates and requires reading cookies. Treat
as a last-resort power-user option, not the default.

### D. Spicetify extension

Out of scope: a different toolchain that patches the Spotify client itself.

**Decision: B, with A as the offline/read-only fallback. C only if B's OAuth
proves unusable in the Discord renderer.**

## 3. Auth plumbing (the risky part)

### Verified environment facts (probed live from a BD plugin, 2026-10-21)

| Probe | Result |
| --- | --- |
| `typeof process` | `object`, but `process.versions.node` is `undefined` (shim, not real Node) |
| `typeof module.require` | `undefined` |
| `typeof require` / `typeof window.require` | `function`, but it is Discord's **asset** loader |
| `require("http")` | throws `ENOENT ...\app-1.0.1226\http` (tries to resolve a file path) |
| `process.mainModule` | `undefined` |

**Consequence: no Node builtins in the renderer, so no in-plugin TCP listener and
no in-plugin token file IO.**

v0.7.0 therefore treats the loopback listener as an optional fast path: if
`require("http")` happens to work, Connect captures the code automatically.
Otherwise the panel still does the full PKCE flow in-page and asks the user for
one paste (see below). No external process is required.

### Primary flow: in-panel PKCE + paste the redirected URL

1. The user creates a free app at <https://developer.spotify.com/dashboard> and
   registers `http://127.0.0.1:8899/callback/` exactly (trailing slash).
2. The panel generates `code_verifier` + S256 `code_challenge` + `state`,
   builds the authorize URL, and opens it in the system browser.
3. The user approves. The browser redirects to the loopback URI, which has no
   listener, so it shows a connection error. The address bar still contains
   `?code=...&state=...`.
4. The user pastes that full URL into the panel's "Finish login" field.
5. `completeAuth()` parses the code, checks `state`, exchanges the code at
   `accounts.spotify.com/api/token` (CORS-allowed from the renderer), and saves
   `refreshToken`/`scope` in `BdApi.Data`.

A bare authorization code is also accepted. Login material is held in memory
for 15 minutes and discarded after success.

### Optional flow: external PKCE helper

`tools/spotify-auth.ps1` does the same PKCE flow with a real `HttpListener`,
which removes the paste step on Windows. It prompts for the Client ID, writes
`SpotifyPanel.tokens.json`, and updates `SpotifyPanel.config.json` directly so
the user only toggles the plugin. It is kept as a convenience, not a
requirement.

The user pastes the refresh token into the Spotify panel's settings field; the
plugin stores it in `BdApi.Data` and performs refreshes itself with `fetch`
(plain HTTPS to `accounts.spotify.com`, which works from the renderer).

Refresh tokens survive ~indefinitely unless revoked; the flow is rerun only on
revocation.

### Fallback flows

- **Manual copy of the code** (no helper): register `http://127.0.0.1:8899/callback`
  as the redirect, authorize, let the browser fail to connect, copy `code=` out of
  the address bar into the panel. Same paste step, more friction.
- **Read-only presence mode** (no auth at all): show what Discord already mirrors.
- **Local client cookies** (`sp_dc` → `open.spotify.com/get_access_token`): not
  recommended, undocumented, breaks on updates.

### Token handling in the plugin

- Store `refreshToken` in `BdApi.Data` (plaintext JSON on disk, same trust level
  as the Discord token store; note it in settings copy).
- Access token cached in memory with `expiresAt`; refresh 60s early; on a single
  `401`, refresh and retry once; on refresh failure, fall back to presence mode
  and show "Reconnect Spotify".
- Never log tokens. Log only `len=N` on refresh for debugging.

## 4. API surface (v1)

| Purpose | Call |
| --- | --- |
| player state | `GET /me/player` (includes device, track, progress, shuffle, repeat, volume) |
| devices | `GET /me/player/devices` |
| transfer | `PUT /me/player` `{ device_ids:[id], play:true }` |
| play/pause | `PUT /me/player/play` / `PUT /me/player/pause` |
| next/prev | `POST /me/player/next` / `POST /me/player/previous` |
| seek | `PUT /me/player/seek?position_ms=` |
| volume | `PUT /me/player/volume?volume_percent=` |
| shuffle | `PUT /me/player/shuffle?state=` |
| repeat | `PUT /me/player/repeat?state=track\|context\|off` |

Notes:
- `GET /me/player` returns `204` when nothing is active; treat as idle.
- Progress is only as fresh as the poll. Poll every 5s while the panel is open
  and visible, 30s while hidden; interpolate locally with `progress_ms +
  (now - fetchedAt)` clamped to `duration_ms`.
- Optimistic UI for transport buttons, reconciled by the next poll. Debounce
  double-clicks (Spotify happily skips two tracks).
- `403 RESTRICTED_DEVICE` / `PREMIUM_REQUIRED` must surface as a short inline
  message, not a toast storm.

### Discord music bot bridge (v0.8.0)

The green Send button posts a normal message as the logged-in user through
Discord's `MessageActions.sendMessage`; there is no bot token or webhook.

- Bot presets: Jockie Music (`m!`, default), JMusicBot (`!`), MusicBot
  (just-some-bots, `!`), and Custom. `M!` is Jockie, not Muse. Slash-only bots
  (Muse, MEE6, Green-bot) cannot be driven this way.
- Play query is track title + all artist names; templates support `{prefix}`,
  `{query}`, `{title}`, `{artist}`, `{album}`, `{url}`, `{uri}`.
- Settings: `musicBotId`, `musicBotPrefix`, `musicBotCommands`,
  `musicChannelId`. Per-action overrides live in `musicBotCommands`.
- Left-click sends play. Right-click opens Play/Pause/Skip/Previous/Repeat/
  Shuffle/Queue/Now playing/Stop plus a raw Custom command input.
- No client-side send throttle. Commands are chained in click order; Discord's
  own rate limits remain.
- Auto-detection is deferred to v1.1. Research: feasibility exists via
  `ChannelStore`, `VoiceStateStore`, `MessageStore`, `GuildMemberStore`, but
  lazy members and playback-only channels make it unreliable. Manual selection
  is authoritative. Full contract: `docs/SpotifyPanel.musicbot.spec.md`.

## 5. UI and placement

Reuse SideChat's visual contract verbatim: opaque `#2f2f2f`, `#2a2a2a` header,
`var(--border-thickness)` outline, square corners, `::after` label `spotify`,
hover `var(--border-hover)`, 12px gaps (`var(--gap)`), z-index 150,
header right padding for the window controls (`titlebarClearance`).

Placement options:

- **A. Stacked right column (recommended).** Right column splits into two panels
  with a 12px gap: Spotify on top (`~210px` collapsed height, resizable
  180-360) and SideChat below, both full-bleed to the same right/bottom gaps.
  Two labels (`spotify`, `sidechat`) read as part of the theme's panel system.
  Works at the user's current 623px window height: 210 + 12 + ~390.
- **B. Side by side.** Spotify docked left of SideChat (`right: gap + width +
  gap`). Needs ~1100px+ window width before it overlays the chat panel; keep as
  a setting for wide monitors.
- **C. Tabs inside one shell.** Compact, but merges two identities and loses the
  "another panel" look the user asked for. Not recommended.

Layout state to persist: `placement` (`stack` | `left` | `tab`), `height` (stack)
or `width` (left), `visible`, `hotkey`.

Panel body:

```
[art 64] Title                       [Open in Spotify]
         Artists · Album
         ──────────●─────────────── 1:12 / 3:45
[shuffle] [prev] [play/pause] [next] [repeat]   [vol]
Devices: (pill row, current highlighted)
```

- Art: `albums` image URL from the API (largest, then fall back to presence art).
- Buttons: text glyphs or inline SVG; no icon font dependency.
- Idle state: "Nothing playing" + device pills + "Reconnect Spotify" when needed.
- Auth-required state: short copy, "Connect Spotify" button that runs the flow.

## 6. Shared code with SideChat

Both plugins need the same shell CSS, resize handle, hotkey plumbing, label,
and window-control clearance. Options:

1. **Duplicate ~120 lines** of CSS/helpers per plugin. Simplest, zero coupling,
   but they drift.
2. **Shared style injected once**: both plugins call
   `BdApi.DOM.addStyle("jcode-panels", PANEL_CSS)`; identical string, id-guarded
   by BD. Any plugin can be unloaded without killing the other (BD removes the
   style by id on unload, so the last one out owns re-adding it; acceptable).
3. **A tiny shared plugin** (`JcodePanels`) exposing `window.__jcodePanels`
   helpers, with both panels depending on load order. More moving parts.

Recommendation: **2 for CSS** (duplicated constant, single style id), and
duplicate the ~40 lines of JS helpers (hotkey parser, resize handler) with a
comment pointing at the other file. Keep plugins independently loadable.

## 7. Phased plan

**P0 - spike (resolved 2026-10-21)**
1. ~~Verify Node access in the renderer.~~ **No Node builtins** (see 3). The
   loopback listener cannot live in the plugin.
2. Confirm `fetch("https://accounts.spotify.com/api/token", ...)` and
   `fetch("https://api.spotify.com/v1/me/player")` work from the renderer
   (CORS: Spotify sends `Access-Control-Allow-Origin: *` on the token endpoint;
   the API accepts a bearer token too, but verify with the real Client ID).
3. Confirm `PresenceStore` Spotify activity shape for the fallback.

Gate: if step 2 fails, everything moves into the PowerShell helper and the
plugin only renders state the helper writes to the config file (rerun per use,
much worse). Test this first.

**P0.5 - helper (0.5 day)**
- Write and test `tools/spotify-auth.ps1` (PKCE + `HttpListener` + token
  exchange), including clipboard output and a clear error for a wrong Client ID
  or an unregistered redirect URI.

**P1 - read-only panel (0.5 day)**
- Panel shell + label + hotkey + resize on the chosen placement.
- Renderer fed by presence; art, title, artists, local progress interpolation.
- Empty/idle states. No tokens yet.

**P2 - controls (1 day)**
- Settings section: client id, connect button, status line.
- Token store + refresh + 401 retry.
- Transport, seek, volume, shuffle/repeat with optimistic UI and error copy.
- Device pills + transfer.

**P3 - polish (0.5 day)**
- Polling policy, hidden-panel throttling, window resize reflow with SideChat.
- Deep link, hotkey conflict check with SideChat (`Alt+B` vs `Alt+M`).
- Error taxonomy (premium, restricted device, revoked token, offline).
- Harness tests (see 9), docs, README updates.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| No Node in renderer → loopback impossible | manual code paste flow (option 2) |
| Free account → no control | read-only mode + explicit "Premium required" note |
| No Spotify app running → `404 NO_ACTIVE_DEVICE` | device picker; copy explains "open Spotify once" |
| Refresh token revoked / password change | "Reconnect Spotify" button, presence fallback keeps panel useful |
| Token in plaintext config | document it; optional DPAPI hardening (P3+) |
| Port 8899 busy / firewall prompt | try 8898/8897; copy mentions the prompt |
| Polling rate limits (429) | 5s visible / 30s hidden, exponential backoff on 429 |
| Panel real estate at 623px height | stacked layout with a collapsible art/track row (min 150px) |
| Window controls overlapping the new header | reuse `titlebarClearance` (146px) exactly as SideChat |
| Theme class collisions (`status`, `progress`, `title`) | namespace every class `sp-*`, prefer id-scoped rules when overriding radii |

## 9. Test plan

Mirror the SideChat harness (stubbed `BdApi`, real plugin file):

- auth: PKCE challenge generation (known verifier → expected S256), state
  mismatch rejection, token expiry math, 401 → refresh-once → retry.
- render: idle / playing / premium-error / reconnect states; progress clamping
  (never exceeds duration, never negative).
- transport: button → correct endpoint + param, debounce, optimistic revert on
  failure.
- polling: interval choice by visibility, no overlapping requests, 429 backoff.
- lifecycle: start/stop removes DOM, CSS, intervals, hotkey listener, http
  listener; two start/stop cycles leak nothing (assert on timer/listener counts).

## 10. Open questions for the user

1. Placement: stacked above SideChat (recommended), side-by-side, or tabs?
2. Hotkey: `Alt+M` acceptable, or do you want something closer to `Alt+B`?
3. Acceptable to create a one-time Spotify developer app (Client ID paste), or do
   you want the presence-only read-only panel first?
4. Do you need control of *other* devices (phone/speakers), or only the desktop
   app on this machine?
5. Should the panel auto-hide when nothing is playing, or stay visible with an
   idle state?
