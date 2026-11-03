# SpotifyPanel transport spec

Status: implemented in v0.6.4 (2026-10-22)
File under spec: `SpotifyPanel.plugin.js`
Related: `docs/SpotifyPanel.scope.md`, `docs/SpotifyPanel.build.md`

## 1. Purpose

Define the required behaviour of the panel's transport controls - previous,
play/pause, next - so that "skip" always either changes playback or reports a
precise failure. This spec exists because v0.6.3 buttons returned successfully
while the song did not change.

## 2. Terms

- **Command** - a Spotify Web API call that mutates playback
  (`POST /me/player/next`, `PUT /me/player/play`, ...).
- **Context** - the ordered set of tracks Spotify is playing through. A context
  with one track has no next or previous track.
- **Active device** - a Spotify Connect client currently registered to the
  account, returned by `GET /me/player/devices`.
- **Visible list** - the ordered rows the user is looking at: Songs, Recent,
  Search results, an opened album/playlist, or the queue view.

## 3. Functional requirements

### FR-1 List playback

When the user picks a track from a visible list with more than one playable
entry, the plugin MUST start playback with the whole list as the context and
the picked row as the offset.

- Request: `PUT /me/player/play`
- Body: `{ "uris": ["spotify:track:...", ...], "offset": { "position": n } }`
- `n` is the zero-based index of the picked row in the visible list.
- Empty/absent URIs are dropped before the request.

When the visible list contains exactly one entry, the plugin MAY send the
single-track body used before v0.6.4. Skipping within a one-track context is
expected to restart that track; that is Spotify behaviour, not a plugin bug.

The header "Play on this device" row keeps using `context_uri` for
albums/playlists so Spotify owns the ordering.

### FR-2 Skip commands

Previous and next MUST issue:

- `POST /me/player/previous`
- `POST /me/player/next`

No body is required by Spotify. The plugin MUST treat any 2xx as success and
refresh player state afterwards. The panel MUST NOT claim success optimistically
for skip (there is no local prediction of the next track).

### FR-3 Wake an idle device

If a command fails with HTTP 404 and `error.reason == "NO_ACTIVE_DEVICE"`, the
plugin MUST:

1. Read `GET /me/player/devices`.
2. Pick the first device with an `id` that is not `is_restricted`.
3. Transfer to it with `PUT /me/player` and
   `{ "device_ids": [id], "play": false }`.
   `play` MUST be `true` only when the original command is a play command
   (`/me/player/play`), so a skip never starts unexpected audio on an idle
   device.
4. Wait 400 ms.
5. Retry the original command exactly once.

If no device exists, or the transfer fails, the original error is surfaced.

### FR-4 Retry 411

If a bodyless command fails with HTTP 411, the plugin MUST retry it once with
`{}` as the JSON body, which forces a Content-Length. This retry is independent
of FR-3 and applies to POST and PUT.

### FR-5 Error reporting

A failed command MUST produce a `{ ok: false, error, status, reason }` result.
The panel MUST render the message in the `.sp-error` line and MUST NOT silently
swallow it.

### FR-6 Refresh after success

After a successful transport command the panel MUST re-read
`GET /me/player` (currently after 350 ms) and reconcile the UI with Spotify.
The 5 s poll remains the backstop.

## 4. API contract summary

| Action | Method and path | Body |
| --- | --- | --- |
| Play list | `PUT /me/player/play` | `{ uris, offset: { position } }` |
| Play context | `PUT /me/player/play` | `{ context_uri }` |
| Play one track | `PUT /me/player/play` | `{ uris: [uri] }` |
| Pause | `PUT /me/player/pause` | none (retry `{}` on 411) |
| Next | `POST /me/player/next` | none (retry `{}` on 411) |
| Previous | `POST /me/player/previous` | none (retry `{}` on 411) |
| Seek | `PUT /me/player/seek?position_ms=` | none |
| Volume | `PUT /me/player/volume?volume_percent=` | none |
| Transfer | `PUT /me/player` | `{ device_ids: [id], play }` |
| Devices | `GET /me/player/devices` | - |
| State | `GET /me/player` | - |

Notes:

- `GET /me/player` returns `204 No Content` when no device is active. Treat as
  `null`, not an error.
- The next/previous endpoints can return `200` with an opaque body as well as
  `204`. Non-JSON bodies must not be treated as failures.
- A 404 with `NO_ACTIVE_DEVICE` is recoverable per FR-3.
- A 403 with `PREMIUM_REQUIRED` (or the panel's "premium required for control")
  is not recoverable and must be shown.

## 5. Invariants

- One command in flight per click: the `busy` guard drops re-entrant clicks.
- A retry never multiplies into more than one wake plus one command retry.
- Skip wake MUST NOT start playback.
- The queue view's "up next" rows use the same list semantics as other rows
  (now-playing + upcoming, offset shifted by one when now-playing exists).

## 6. Acceptance criteria

1. Pick row 3 of Songs: Spotify receives all song URIs with
   `offset.position == 2`; the picked track plays.
2. Click next: the next track in that list plays; the panel shows it within
   one refresh cycle.
3. Click previous: the previous track plays (or the current track restarts
   when it is at position 0, per Spotify).
4. Play a single-track album and click next: the track may restart; no error
   is required or shown. This is explicitly out of scope for a fix.
5. With Spotify idle but registered: click next. The plugin transfers silently,
   retries, and the track changes without audio starting on an idle device for
   non-play commands.
6. With no registered device: click next. The `.sp-error` line shows
   "Player command failed: No active device found" (or equivalent).
7. Force a 411: the command succeeds on the retry with a `{}` body.
8. A 204 from `GET /me/player` renders "nothing playing" with no error.

Automated coverage (`.jcode-tests/SpotifyPanel.lifecycle-test.js`):

- "next maps to POST /me/player/next"
- "411 retried instead of failing"
- "411 retry sends an empty JSON body"
- "skip wakes a device and retries"
- "wake targets the available device"
- "skip wake does not start playback"
- "playTracks sends the whole list"
- "playTracks sends the picked offset"

Manual coverage (live API, 2026-10-22): restarting the idle Spotify desktop
client restored `/me/player/devices`; `POST /me/player/next` on a one-track
context restarted the same track, confirming FR-1 as the root cause.

## 7. Out of scope

- Gapless/crossfade behaviour owned by Spotify.
- Autoplay/recommendation selection after the end of a list.
- Local-file playback.
- Restarting the Spotify client automatically; the plugin may report a missing
  device but must not manage the client process.
