# SpotifyPanel: build notes

Updated: 2026-10-21 (evening session). Version 0.1.0.
Target: Discord PTB `1.0.1226` + BetterDiscord + system24, Windows.

The panel is a docked Spotify controller in the right column, styled after the
user's "Flat Music Player" Rainmeter skin and Spotify's own mobile player. It
replaces / alternates with SideChat (they hide each other).

---

## 1. Files

| Path | Purpose |
| --- | --- |
| `%APPDATA%\BetterDiscord\plugins\SpotifyPanel.plugin.js` | the whole plugin (single file) |
| `%APPDATA%\BetterDiscord\plugins\SpotifyPanel.config.json` | persisted settings incl. refresh token |
| `%APPDATA%\BetterDiscord\plugins\SpotifyPanel.tokens.json` | token record from the auth helper |
| `%APPDATA%\BetterDiscord\plugins\docs\tools\spotify-auth.ps1` | one-time PKCE login helper |
| `%APPDATA%\BetterDiscord\plugins\.jcode-tests\SpotifyPanel.lifecycle-test.js` | 25-assertion headless harness |

## 2. Auth (done once, working)

- Spotify app created in the developer dashboard: redirect
  `http://127.0.0.1:8899/callback/`, Web API enabled. The Client ID is
  per-install, stored locally in the panel settings, and never committed.
- Scopes: `user-read-playback-state`, `user-modify-playback-state`,
  `user-read-currently-playing`, `playlist-read-private`,
  `playlist-read-collaborative`, `user-read-private`, `user-library-read`,
  `user-library-modify`, `user-read-recently-played`, `user-read-playback-position`,
  `user-follow-read`, `user-top-read`.
  The library tabs, the heart (save) button and Recently Played need the `user-library-*`
  and `user-read-recently-played` scopes, so tokens minted before v0.2.0 must be
  re-minted: run `docs/tools/spotify-auth.ps1` again and paste the new refresh token
  into the plugin settings (the panel shows "needs library scope" on a 403 until then).
  Old token scopes still cover player control, playlists and search.
  The plugin records the granted `scope` string from every token refresh, so it can
  tell you which features the current token supports instead of firing 403s:
  library tabs and the heart show a re-auth hint when `user-library-read` is absent.
- `spotify-auth.ps1` performs PKCE + loopback capture, writes
  `SpotifyPanel.tokens.json`, copies the refresh token to the clipboard.
- The plugin refreshes the access token itself (`accounts.spotify.com/api/token`)
  and persists a rotated refresh token. Verified from the renderer: token 200,
  `/v1/me/player` returns the live track.

**Important**: BetterDiscord caches plugin settings in memory. Editing
`SpotifyPanel.config.json` while Discord runs has no effect and the running
instance can overwrite your edit. To change a setting in code, force it once in
`start()` with `this.settings.x = ...; this.save();`, reload, then remove the
temporary line.

## 3. Layout (v0.4.0 modern player pass)

Superseded look: the terminal-style panel (outer border, `spotify` pseudo-label, status
strip, full-bleed art) is replaced. Rules live in the last stylesheet block; the old
blocks stay as history and are overridden.

- Surface: `#spotifypanel-panel` has `border: 0`, `background: #121212`,
  `::after { display: none }` (that pseudo-element was the `spotify` label) and a
  geometric font stack (`Inter`, `Plus Jakarta Sans`, `system-ui`).
- Nav: `.sp-nav` is a flex row, `padding: 26px 20px 16px`, chevron-back left, kebab
  right, and **no heart** (removed by request - liking lives in the transport). The
  kebab keeps an inline `paddingRight: titlebarClearance` (146px) so it never sits
  under Discord's window close button; an earlier version without that reservation
  put the kebab exactly under the close button.
- Art: centred square, `panelW - 48` wide (24px margins), radius 8, placeholder
  `#00A859`.
- Info row: 3-column grid (shuffle | title+artist | repeat), `margin-top: 28px`,
  24px gutters. Title 18px/700 uppercase white with 0.5px tracking, artist 14px
  `#999`.
- Scrubber: 3px `#333` track, `#1DB954` fill, 10px circular green thumb, times
  12px `#888`.
- Transport: five equal slots; filled heart (`#666` unsaved / `#1DB954` liked),
  white prev/next, 56px **transparent** circle with a 1.5px white border and white
  glyph, green star for add-to-queue.
- Dock: `.sp-dock-icons` (queue left, disabled download right), `.sp-glow-line`
  (green gradient + glow), then `.sp-dock` (`#1C1C1C`, 12px 20px): 32px green
  play circle, `Artist – Title` at 13px, chevron-up to browse.
- Volume and device transfer moved into the kebab menu, together with **Reconnect
  Spotify** (copies the auth command to the clipboard and points at the settings
  field), because scopes can only be granted by a fresh authorize, never by refreshing.
- Re-auth completed 2026-10-21: the live token now carries all 12 scopes
  (`user-library-read/modify`, `user-read-recently-played`, `user-follow-read`,
  `user-top-read` included). Verified against the real API: `/me/tracks`,
  `/me/albums`, `/me/player/recently-played`, `/me/following` and
  `/me/player/queue` all return HTTP 200 with rows, and the heart renders filled
  green in the live panel.
- `SpotifyPanel.tokens.json` is written by PowerShell with a UTF-8 BOM - strip
  `\uFEFF` before `JSON.parse` when reading it from Node.
- Sizing: `chromeH = 392` covers nav + info + scrubber + transport + dock; art is
  `max(96, min(panelW - 48, panelBoxH - chromeH))`.

Live evidence: `docs/previews/spotify-live-discord.png` (Discord PTB 1.0.1226,
1385x701 window) shows the finished player. A temporary `document.title` probe was
used to read live geometry (body 607px tall, art 291px, dock 56px at the bottom),
which exposed a real bug: `.sp-body`'s inherited `gap: 10px` plus the old 386px
chrome budget pushed the dock 63px past the body, where `overflow: hidden` clipped
it. Fixed with `gap: 0` and `chromeH = 392`.


- Panel: `#spotifypanel-panel`, right-docked, `top: settings.topOffset` (12),
  `fullHeight: true` by default - it stretches from the top gap to the bottom gap
  instead of a fixed height (`fullHeight: false` restores the drag-resizable
  150-440px card).
- Composition is **centered** both ways, matching the desktop-player reference: the
  player block (art, meta, progress, transport) is centered vertically inside the
  panel body with the device pills right under it; art centered at
  `min(300, 62% of panel width, available height)`, title and artist centered under
  it, square artwork corners (system24 rule, no radius).
- Artwork: `chromeH = 245` is reserved for meta + progress + transport + device
  row, so the art never pushes the controls off the card; size is
  `max(72, min(300, 62% of width, available height))` and the box is
  `flex: 0 0 auto`, so the art stays square (a short panel gets a small square,
  never a stretched crop).
- Text: track title 16.5px/700 white, artist 12px at 55% white, 5px under it.
- Progress: 2px rail at 28% white, white fill, turns Spotify green on hover, times
  9px at 38% at each end, 22px below the artist.
- Transport: five **equal** slots (`grid-template-columns: repeat(5, 1fr)`,
  `justify-items: center`, 10px side padding): like heart, prev, play, next,
  add-to-queue. Measured at 420px the slot centres are 79.2px apart with a 0.01px
  spread, play sits on the panel centre line (0.02px off) and all five share one
  vertical centre. Play is a 56px white circle with a 26px glyph nudged -1.5px
  (Material's triangle is optically right-heavy).
- Icons: Material Design 24x24 **solid** glyphs (Apache-2.0) in `ICONS`, rendered by
  `icon(name, size)` with `fill: currentColor`, no stroke, and `.sp-icon { display:
  block; flex: 0 0 auto }`. One scale: 15 (header), 16 (volume), 20 (shuffle/repeat),
  22 (heart/prev/next/plus), 26 (play/pause). Hit boxes are 26px in the header, 28px
  in the shuffle/repeat row, 36px in the transport and 24px for volume, so every
  glyph keeps at least 5px of clearance (measured minimum: 7px). The heart is an
  outline (`heartOutline`) when unsaved and solid green when liked.
- Footer is a stacked `.sp-foot` (column, `align-items: stretch`): optional device
  pills on their own line, then the volume row, which now **spans the full panel
  width**: speaker icon at the 18px gutter, `input[type=range]` filling the rest
  (`width: 100%; flex: 1 1 auto`). Confirmed live in Discord, not just the mock.
  Device pills only exist when Spotify reports no active device.
- Verified **live in Discord PTB 1.0.1226** (screenshot:
  `docs/previews/spotify-live-discord.png`): panel renders with real playback data,
  transport glyph centres read 1119.5 / 1200.5 / 1277.5 / 1354.5 / 1435.5 px
  (gaps 81 / 77 / 77 / 81, pixel-measurement tolerance ~2px), heart left, play
  centred, plus right. Editing the CSS while Discord runs hot-reloads the panel -
  the footer jumped to right-alignment between two captures, which also proves the
  live code path.
  The first live capture also exposed a real bug the mocks missed: with no device
  pills the volume sat left-aligned, which is why `.sp-foot` now uses `flex-end`.
- Narrow panels (< 360px, `sp-narrow` class computed from `panelW`): header buttons
  drop to 24px with a 4px gap, the "open in Spotify" link hides, and the status line
  collapses to just the device name. Before this the status line was squeezed to
  12px at a 300px panel width; it measures 56px now.
- Devices: quiet pill row directly under the transport (35% opacity); the whole
  block is vertically centered in the panel body, so no dead area collects at the
  bottom.

Earlier looks are still in the stylesheet as ordered blocks (base -> flat skin ->
Spotify feel -> reference pass); the last block wins, so new passes are appended
rather than rewriting old rules.

Style provenance: the base look came from `Downloads\flat_music_player.rmskin`
(card colour, mint accent `43,226,133`, 2px rail, artist-above-title), then was
pushed toward Spotify mobile (white progress, white circle play, left-aligned
title, green active states).

## 4. Features

### v0.8.6: compact bottom bar restored, no mini player clone

- Removed the docked copy of the full player. Playlists, queue, connect and
  settings go back to the 64px `.sp-mini` bar (green play circle,
  `Artist – Title`, chevron), pinned with `margin-top: auto`. Clicking back from
  Now Playing no longer drops a squeezed player onto the library.
- The bar's 2px progress strip stays deleted; track progress lives only on the
  Now Playing scrubber.
- `.sp-seek` now clears the theme's white input fill
  (`border: 0; background-color: transparent`) and pins the rail to 3px. That was
  the white slab visible under the green fill in 0.8.5.
- `renderPlayer()` is Now Playing only; `miniBar` is the only bottom section.

### v0.8.5: one player everywhere, scrubber between the times

- The 2px song-progress strip on the old bottom mini-player (`.sp-mini-bar`) is
  gone. The only track progress shown now is a real scrubber.
- `Now Playing` progress row is `elapsed time | draggable rail | total time`
  (`.sp-time` / `.sp-seek`), styled like the YouTube panel rail (3px `#333`
  track, green fill) but draggable with a white/green thumb. Dragging updates the
  thumb immediately, sends one debounced `seek` after 180ms, and holds the drawn
  position for 1.4s so the 5s poll cannot snap it back mid-drag.
- One shared `renderPlayer(docked)` tree (art, shuffle/title/artist/repeat,
  scrubber, heart/prev/play/next/send, volume) now feeds every view:
  - `Now Playing` renders it full size.
  - Playlists/browse, queue, connect and settings render the same tree docked at
    the bottom (`.sp-player-dock`, 64px art, same child order). The separate
    `.sp-mini*` markup and CSS are deleted, so the two players cannot drift.
- The Now Playing view no longer renders a duplicate mini bar under the player.

### v0.8.0: selectable Discord music bot and command menu

- Replaced the hardcoded `M!play <song>` with bot profiles: **Jockie Music**
  (`m!`, default), **JMusicBot** (`!`), **MusicBot** (`!`), and **Custom bot**.
  Research correction: `M!` is Jockie, not Muse; Muse/MEE6/Green-bot are
  slash-only and cannot be driven by chat messages.
- Play now sends **track name + all artist names** (`{query}`), e.g.
  `m!play you need it - Slowed airshade`. `{title}`, `{artist}`, `{album}`,
  `{url}` and `{uri}` are also available in templates.
- Panel settings gained a **Discord music bot** section: bot dropdown, prefix
  override, live play preview, and a collapsible per-action template editor with
  reset-to-preset. The BD settings panel has the same bot/prefix fields plus a
  JSON override box.
- **Left-click Send** posts the selected bot's play command. **Right-click
  Send** opens a command sheet with Play, Pause, Resume, Skip, Previous, Repeat,
  Shuffle, Queue, Now playing, Stop/leave. Unsupported actions are hidden.
  Each row shows the exact command it will send.
- A **Custom command...** row posts arbitrary text unchanged, e.g.
  `m!volume 20`.
- No client cooldown or artificial delay. Sends are chained so rapid clicks
  keep their order; Discord's own rate limits still apply and are surfaced.
- Detection research (deferred): `BdApi.Webpack.getStore` can find bots via
  voice states, recent message authors and lazy guild members, but playback-only
  channels and webhook bots defeat reliable inference. Manual selection is the
  shipped flow; a Detect button is a v1.1 candidate.
- Tests: 199 assertions, including profile mapping, name+artist queries, prefix
  and template overrides, unsupported-action hiding, rapid-send ordering, raw
  custom commands, preset tables, chain error recovery, settings-panel override
  parsing, template-token validation, message-module fallbacks, legacy-config
  migration, and reload persistence.
- Full contract and preset table: `docs/SpotifyPanel.musicbot.spec.md`.
- Headless Chrome UI smoke (2026-10-22): panel mounted, left-click sent
  `m!play Test Song Test Artist`, right-click opened and prevented the native
  menu, Escape/backdrop closed the sheet, Skip sent `m!skip`, switching to
  JMusicBot updated the preview and menu and removed Previous, Custom command
  sent `!volume 20`, Reset restored the preset, and switching to Custom cleared
  the prefix and overrides.

### v0.7.0: bring-your-own Spotify app and one-panel setup

- The hardcoded Client ID is gone (`DEFAULT_SETTINGS.clientId = ""`). A shipped
  copy no longer depends on the author's Spotify app or its development-mode
  user cap. Each install creates its own free app.
- **Panel settings** is now a real connection screen: client ID, refresh token,
  a link to https://developer.spotify.com/dashboard, the exact redirect URI with
  a Copy button, Connect, Save token, Disconnect, and the existing Discord
  channel field. The BD plugin-settings panel keeps the same fields with the
  same instructions.
- **Connect** implements Authorization Code + PKCE in-plugin:
  - `beginAuth()` makes a verifier/S256 challenge/state and stores them until
    the login returns.
  - If Node `http` is available, `connectSpotify()` starts a loopback listener
    on `127.0.0.1:8899`, opens the system browser, captures the code, exchanges
    it, and saves the refresh token with no copy/paste.
  - If Node is unavailable (the normal BD renderer sandbox on this build),
    `beginAuth()` opens the auth page and the panel shows a "Finish login" box.
    The user approves, the browser fails to connect on the loopback URI, and
    they paste the address-bar URL back. `completeAuth()` parses `code`/`state`,
    verifies state, exchanges the code, and saves the token.
- First-run onboarding: with no refresh token, every view except Settings shows
  a three-step Connect card (create app, redirect URI, paste Client ID) instead
  of the dead "not connected" player.
- `docs/tools/spotify-auth.ps1` now prompts for a Client ID and writes the
  credentials into `SpotifyPanel.config.json` as well as
  `SpotifyPanel.tokens.json`, so the helper path is one run plus a plugin
  toggle. It no longer ships a shared default Client ID.
- Tests: PKCE format, auth URL parameters, Connect guard, `beginAuth`,
  state-mismatch rejection, code exchange, settings persistence. 76 assertions.

### v0.6.4: prev/next actually skip

- **Root cause 1 (no queue):** every track row called `playUri(uri, false)`, which
  sent `PUT /me/player/play` with `{ uris: [oneTrack] }`. A one-item context has
  nowhere to go, so Spotify accepted `next`/`previous` but nothing moved. Rows in
  Songs, Recent, Search and opened albums/playlists now send the whole visible
  list plus `offset.position` via `playTracks(uris, index)`; the queue view sends
  now-playing + up-next the same way.
- **Root cause 2 (no device):** bodyless `POST /me/player/next` and
  `POST /me/player/previous` fail with `NO_ACTIVE_DEVICE` when Spotify desktop is
  idle or not registered. `send()` now lists devices, transfers to the first
  non-restricted one (silently: `play: false` except for `/play`), waits 400 ms,
  and retries the command once. Errors surface in `.sp-error` if it still fails.
- **Root cause 3 (411):** Spotify's edge returns `411 Length Required` for
  bodyless POST/PUT when no Content-Length arrives. `send()` retries once with
  `{}` as the body, which forces a length. Verified with curl: bare POST -> 411,
  POST with an empty body -> normal API response.
- Tests: 5 new assertions (411 retry body, device wake target, silent wake,
  playTracks list, playTracks offset). 55 total.
- Version bumped to 0.6.4. Reload required (toggle the plugin or restart Discord).

### v0.6.3: back button is a toggle, not history

- Back chevron is now a two-state toggle: on the player it opens the playlist page
  (tab reset to `playlists`, `openList` and search results cleared); anywhere else it
  returns to the player. History stack helpers remain but are no longer used by the
  back button.

### v0.6.1: Discord music-channel send

- v0.6.2 adds an in-panel settings screen (kebab -> **Panel settings**) with the
  music channel id field, a **Use current channel** button backed by
  `plugin.currentChannelId()` (webpack `getChannelId`), a Save that writes
  `settings.musicChannelId`, and a live preview of the exact command
  (`Sends: M!play <song>`).

- The transport star is now a **Send** button (`sp-send`, Material send glyph). It calls
  `plugin.sendToMusicChannel(track.name)`, which posts `M!play <song name>` to the
  channel id stored in the new `musicChannelId` setting, using Discord's own
  `MessageActions.sendMessage` resolved through `BdApi.Webpack` (`getByKeys` ->
  `getByProps` -> `getModule`). No bot token or webhook involved - the message is sent
  as the logged-in user.
- Failure paths surface in a green `.sp-notice` line under the transport: no channel
  configured, nothing playing, message module missing, or the send rejecting.
- Harness covers all four paths (50 assertions total).

### v0.6.0 adjustments

- Library tabs trimmed to Playlists / Songs / Recent; Albums, Artists and the Search tab
  were removed. The search input now sits permanently above the tabs and its results
  replace the list until the query is cleared.
- Dock pinned to the panel bottom: `.sp-body { padding: 0 }` plus
  `.sp-body .sp-mini { margin-top: auto }` removes the dead strip that used to sit
  under the mini-player.
- Dock chevron is a real button now: it pushes history and opens the library at
  Playlists, and `.sp-browse` slides up with `@keyframes sp-rise` (180ms ease-out).
- Nav row moved to `padding: 34px 16px 12px` with the 146px titlebar reservation
  removed, so the kebab sits flush right *below* the band where Discord draws its
  minimise/maximise/close buttons.

### Library / mini-player rework (v0.5.0)

- **One docked mini-player everywhere** (`.sp-mini`): 64px bar, `#1C1C1C`, hover
  `#252525`, `cursor: pointer`, and a full-bar `onClick` that sets the view to Now
  Playing. The 32px `#1DB954` play circle calls `e.stopPropagation()` first, so the
  button toggles playback without expanding the player. Text is
  `<strong>Artist</strong> – Title` (white bold + `#A0A0A0`, 13px, ellipsis), with a
  white chevron on the right and a 2px progress strip pinned to the top edge
  (`#333` track, `#1DB954` fill). The old album thumbnail and white-bordered circle
  are gone; `.sp-dock-icons` / `.sp-glow-line` / `.sp-dock` were deleted.
- **Bottom navigation replaces the tab strip.** `.sp-navbar` is 56px, `#141414`,
  `border-top: 1px solid #282828`, four equal grid cells with icon + 10px label.
  Mapping: Home -> playlists, Browser -> albums + artists, Search -> search,
  Library -> saved songs + recent (`NAV_ITEMS` / `navOfTab`). Active is white,
  inactive `#888`. Hidden on Now Playing; the queue moved to the kebab.
- **Back button is a stack:** open playlist -> clears `openList` and returns to the
  grid; other library views -> Now Playing; on Now Playing -> hides the panel.
- **Playlist grid:** `.sp-grid` is `repeat(2, 1fr)` with 16px gap/padding, cards have
  a 1:1 cover (`border-radius: 8px`), 14px white title and 12px `#888` subtitle.
- **Tracklist view:** 140x140 cover, three pagination dots (decorative), a `#1DB954`
  pill with the container name in uppercase plus a green circular **Play** button
  that calls `playContext` on the current device (this replaced the download icon),
  then the glowing divider and icon-only rows. Rows drop thumbnails: title 14px
  white / artist 12px `#888` left, and ban / heart / kebab icons right - each stops
  propagation so the row still plays. Ban hides the row for the session
  (`hiddenTracks`), heart saves that track (`toggleTrackSave`), kebab adds to queue.

- Now playing with live progress interpolation (5s poll, 500ms tick).
- Transport: play/pause, next, previous, shuffle, repeat (off -> context -> track),
  seek by clicking the rail, volume slider with a 180ms debounce (persisted).
- Like / save the current track (heart in the transport, filled green when saved).
- Add the current track, or any row, to the queue (plus button).
- Browse view with six tabs, each loaded lazily and cached: **Playlists**, **Songs**
  (saved tracks), **Albums**, **Artists** (followed), **Recent** (recently played),
  **Search** (track search).
- Detail view for any playlist / album / artist: track rows with PLAY and add-to-queue,
  plus a Play button in the mini bar that plays the whole container (`context_uri`).
- Queue view from the header (list-with-plus icon): now playing plus up next, each row
  playable or re-queueable.
- Devices: `GET /me/player/devices`, click a pill to transfer playback.
- States: idle, `not connected`, premium required, no active device, and per-tab
  errors (403 -> "needs library scope, re-run docs/tools/spotify-auth.ps1").
- Hotkey `Alt+E` (capture-phase, no auto-repeat, resets on blur).
- Mutual exclusion: showing Spotify hides SideChat/YouTube and vice versa through
  a `window.__jcodePanels` registry (`registerPanel` / `hidePanel` /
  `hideOtherPanels`, cleaned up in `stop()`). `start()` also hides other panels
  when Spotify starts visible, so two right-column panels never overlap.
- Left-edge guard: `.sp-edge` (12px left, 14px wide, `z-index: 4`) swallows
  pointer gestures so the members-list / chat resize border underneath cannot be
  grabbed through the panel.

## 5. Bugs found and fixed (keep these notes)

1. `this.api` collision - the BdApi instance shadowed the `api()` HTTP helper, so
   every call threw "this.api is not a function". Instance renamed to `this.bd`.
2. Auth helper: `RandomNumberGenerator.GetBytes()` returns void (state was null),
   `$error` is read-only, and `GetContextAsync()` may only be awaited once (the
   retry loop abandoned the context and hung).
3. Message-input collapse in CollapsibleUI used `modules.guilds.form`, which does
   not exist in this build -> selector was `.undefined`. Now uses
   `modules.input.channelTextArea`.
4. `toggleButton(index, true)` means *force collapse*; label clicks must call it
   without the flag or the panel never expands again.
5. **Play button invisible**: the pause icon was a stroked path
   (`M9 5v14M15 5v14`) rendered with `fill` + `stroke: none`, i.e. zero-width
   filled lines. Pause now uses solid bars (`M8.6 5h2.6v14H8.6zM12.8 5h2.6v14...`)
   and prev/next are solid shapes too; `filled` covers play/pause/prev/next.
6. `PrintWindow` screenshots ghost badly when `backdrop-filter` is active - it
   painted an old browse list over the player and made the play button look
   missing. Verify UI through DOM logs or a real screen capture (window set
   `HWND_TOPMOST` first), not PrintWindow.
7. **Artwork left-aligned while the text was centered**: `.sp-now` only ever got
   `flex-direction` / `align-items`, never `display: flex`, so it stayed a block
   box - the art (fixed inline width) hugged the left edge and `align-items` did
   nothing. Adding `display: flex` was the actual fix for the "still looks off"
   composition; keep it whenever that block is restyled.
8. Recovery: a botched string slice duplicated ~22k chars of this file and broke
   syntax. It was rebuilt from the intact copy left inside the corrupted file
   (`"/**\n * @name " + s.slice(indexOf("SpotifyPanel", 21800))`), then validated
   with `node --check` + the harness. Lesson: stage edits to a temp file,
   `node --check` it, then copy over the live plugin.

## 6. Tests

`node %APPDATA%\BetterDiscord\plugins\.jcode-tests\SpotifyPanel.lifecycle-test.js`

25 assertions: stylesheet injection, stack-variable lifecycle, token refresh and
caching, 401 refresh-and-retry, player/devices parsing, transport URL mapping
(next POST, seek position, volume rounding, repeat state, transfer body), library
parsing (saved tracks/albums, followed artists, recent, album tracks, artist top
tracks, queue split, saved check, save/unsave methods, queue-uri encoding), and
mutual exclusion (publishes `hide()`, hides the other panel, no toggle-back,
unregisters on stop). 44 assertions total as of v0.2.0, including scope tracking
(`hasScope` / `needsLibraryScopes`) and scope persistence on token refresh.

## 7. Known limitations

- Playback control requires Spotify Premium.
- No lyrics, podcasts, playlist editing or follow/unfollow actions in the panel.
- Library pages fetch the first 50 items (single page, no "load more").
- Hashed Discord classes used by `custom.css` (blocks 7-9) need re-checking after
  a Discord update.
- Scripted key injection does not reach the renderer, so hotkeys can only be
  verified by a real keypress; DOM/geometry checks are the fallback.
- BD will not hot-reload a plugin once a save has failed to parse; a Discord
  restart (or a BD off/on toggle for that plugin) is required.
