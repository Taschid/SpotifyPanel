# SpotifyPanel music bot spec

Status: implemented in v0.8.0 (2026-10-22)
File under spec: `SpotifyPanel.plugin.js`
Related: `docs/SpotifyPanel.scope.md`, `docs/SpotifyPanel.build.md`
Behavioural index: `docs/SPEC.md`; build history: `docs/TIMELINE.md`

## 0. What shipped (v0.8.0)

The hardcoded `M!play <song>` was replaced with a bot-aware command system.

- **Bot selector** in Panel settings and BetterDiscord settings: Jockie Music
  (`m!`, default), JMusicBot (`!`), MusicBot (just-some-bots, `!`), Custom.
- **Play query** is the track title plus all artist names:
  `m!play Test Song Test Artist`.
- **Per-action templates** for play, pause, resume, skip, previous, repeat,
  shuffle, queue, now playing and stop, with a live preview and reset-to-preset.
- **Left-click Send** posts play. **Right-click Send** opens the command sheet.
  **Custom command...** posts arbitrary text such as `m!volume 20`.
- **No client-side throttle**: sends are chained in click order, so multiple
  songs can be queued rapidly; Discord's own rate limits still apply.
- **No bot token or webhook**: commands are normal user messages sent through
  Discord's `MessageActions.sendMessage` to `musicChannelId`.
- **Detection deferred**: manual selection ships because client-side inference
  is unreliable in playback-only channels. See section 7.

Files touched: `SpotifyPanel.plugin.js`,
`.jcode-tests/SpotifyPanel.lifecycle-test.js`,
`docs/SpotifyPanel.build.md`, `docs/SpotifyPanel.scope.md`, this spec,
`docs/SPEC.md`, `docs/TIMELINE.md`.

Feature commits: `712cabf` (v0.8.0), `33ed6d8` (menu/settings hardening),
`49e01ee` (official command-doc verification), `2867b1f` (migration/fallback
tests), `e7f8225` (disabled play/raw channel edge cases).

Validation at ship: 199 lifecycle assertions; headless Chrome real-React smoke
covering mount, left-click play, right-click sheet, Escape/backdrop close, Skip,
bot switching, custom command, reset and prefix/template overrides; preset
syntax re-verified against Jockie `/api/commands`, JMusicBot and MusicBot docs.

Reload requirement: BetterDiscord does not hot-reload plugins. Toggle
SpotifyPanel off/on or press Ctrl+R in Discord after updating the file.

## 1. Purpose

Define how the panel sends Discord music-bot commands. The green Send button and
its right-click command menu must speak the selected bot's prefix-command
language, without a bot token or webhook. The plugin posts normal messages as
the logged-in user.

Slash-only bots are explicitly out of scope: Discord does not execute slash
commands from ordinary chat messages.

## 2. Profile schema

Built-in presets live in the `MUSIC_BOTS` constant and are editable per install
through settings.

```js
{
  id: "jockie",
  label: "Jockie Music",
  prefix: "m!",
  note: "short help text",
  commands: {
    play: "{prefix}play {query}",
    pause: "{prefix}pause",
    resume: "{prefix}resume",
    skip: "{prefix}skip",
    previous: "{prefix}previous",
    repeat: "{prefix}repeat queue",
    shuffle: "{prefix}shuffle",
    queue: "{prefix}queue",
    nowPlaying: "{prefix}np",
    stop: "{prefix}stop",
  },
}
```

Actions: `play`, `pause`, `resume`, `skip`, `previous`, `repeat`, `shuffle`,
`queue`, `nowPlaying`, `stop`.

Settings:

```js
musicBotId: "jockie",      // preset id
musicBotPrefix: "",        // blank = preset prefix; may end with a space
musicBotCommands: {},      // action -> template override; "" hides the action
musicChannelId: "",        // existing channel setting
```

Resolution order: preset command -> per-action override. Prefix override
replaces `{prefix}` everywhere. Manual settings always win.

## 3. Template grammar

| Token | Value |
| --- | --- |
| `{prefix}` | resolved bot prefix |
| `{query}` | track title followed by all artist names, space-separated |
| `{title}` | track title |
| `{artist}` | artists joined with `, ` |
| `{artists}` | artists joined with a space |
| `{album}` | album name |
| `{url}` | Spotify track URL |
| `{uri}` | Spotify track URI |

Unknown tokens are left untouched. Repeated whitespace is collapsed and the
result trimmed. An empty or whitespace-only template means the action is not
supported and is hidden from the menu.

Play requires a current track. Other actions never require one.

## 4. Built-in presets (researched 2026-10-22)

### Jockie Music (default)

Prefix `m!`. Play `m!play {query}`, pause `m!pause`, resume `m!resume`,
skip `m!skip`, previous `m!previous`, repeat `m!repeat queue`,
shuffle `m!shuffle`, queue `m!queue`, now playing `m!np`, stop `m!stop`.

### JMusicBot

Prefix `!`. Play `!play {query}`, pause `!pause`, resume `!play`,
skip `!skip`, repeat `!repeat on`, shuffle `!shuffle`, queue `!queue`,
now playing `!nowplaying`, stop `!stop`. No previous command.

### MusicBot (just-some-bots)

Prefix `!`. Play `!play {query}`, pause `!pause`, resume `!resume`,
skip `!skip`, repeat `!repeat all`, shuffle `!shuffle`, queue `!queue`,
now playing `!np`, stop `!disconnect`. No previous command.

### Custom bot

Starts from the generic `!` profile. Prefix and every template are editable.

### Research notes

- `M!` is Jockie, not Muse. Muse, MEE6, Green-bot and similar are slash-only.
- FredBoat is retired. Groovy, Rythm, Aqua, Chip and Hydra are dead or removed.
- Vexera is alive but its music module was being discontinued.
- Sources: `jockiemusic.com/commands` (and its `/api/commands` JSON),
  `jmusicbot.com/commands`, `just-some-bots.github.io/MusicBot/using/commands`,
  `docs.fredboat.com`.
- Re-verified against those pages on 2026-10-22: Jockie `repeat queue`, `np`
  and `stop` aliases; JMusicBot `repeat on`, `nowplaying` and `play`-resumes;
  MusicBot `repeat all`, `np` and `disconnect`.

Presets are defaults, not guarantees. Server owners can change a bot prefix, so
the settings allow full overrides.

## 5. Send behaviour

- Left-click Send: `play` for the current track, formatted with the selected
  profile. Notice shows the exact command sent.
- No track: `nothing playing`. No channel: configure the music channel.
- No `play` template: `this bot has no play command configured`.
- No client-side cooldown or delay. Sends are appended to `_sendChain` so rapid
  clicks are delivered in click order. Discord's own 429/permission errors are
  surfaced in `.sp-notice`.
- Commands are sent with Discord's own `MessageActions.sendMessage`, as the
  logged-in user, to `musicChannelId`.

## 6. Right-click command menu

`contextmenu` on the Send button opens a panel-level sheet titled with the bot
label and prefix. It lists only supported actions, with the resolved command
shown beside each label. Pause and Resume are both listed: the panel knows the
Spotify device's state, not the Discord bot's, so it must not guess.

Actions: Play current track, Pause, Resume, Skip, Previous, Repeat, Shuffle,
Queue, Now playing, Stop/leave.

A **Custom command...** row expands an input and posts the raw text unchanged,
for commands with arguments such as `m!volume 20`. The menu closes on outside
click, the close button, or Escape. Sending a menu action keeps the menu open so
multiple commands can be sent quickly; the result (`sent m!skip` or the error)
appears inside the sheet because the backdrop hides the normal notice line.

## 7. Bot detection (not shipped in v0.8.0)

A best-effort Detect button is possible with `BdApi.Webpack.getStore`:

1. `ChannelStore.getChannel(channelId).guild_id`.
2. Candidates from `VoiceStateStore.getVoiceStatesForChannel()` (strongest
   signal), then bot authors in `MessageStore`, one `fetchMessages` call if the
   channel cache is empty, then loaded `GuildMemberStore` entries.
3. Keep `user.bot === true`.
4. Infer the prefix from at least two recent bot messages; otherwise use the
   preset prefix.
5. One candidate binds; several show a picker; none leaves the manual choice.

Why it is deferred: guild member lists are lazy, message caches are empty for
unvisited channels, playback-only channels expose no command prefix, and
webhook-based bots have no bot user. Detection must never gate sending.

## 8. Validation

Automated (`node .jcode-tests/SpotifyPanel.lifecycle-test.js`):

- default Jockie play sends `m!play <title> <artists>`;
- skip and repeat map to `m!skip` and `m!repeat queue`;
- prefix override produces `@Bot play ...`;
- per-action override and custom templates apply;
- JMusicBot pause/resume map correctly and previous is absent;
- rapid sends keep order with no timer;
- raw command sends unchanged;
- missing channel, missing track and missing message-module errors remain;
- every preset template uses only known placeholder tokens;
- `getByProps` and `getModule` message-module fallbacks resolve;
- legacy configs without bot keys migrate to Jockie;
- bot id, prefix and template overrides survive a simulated reload.

Manual:

- Jockie responds to `m!play`, `m!skip`, `m!repeat queue`, `m!queue`, `m!np`;
- custom prefix and template edits survive a plugin reload;
- right-click menu works on the live panel and closes on outside click/Escape;
- Spotify transport controls are unaffected by bot commands.

Headless Chrome smoke (2026-10-22, real React render):

- panel mounts and reaches the player view;
- left-click sends `m!play Test Song Test Artist`;
- right-click opens the sheet and prevents the native context menu;
- Escape and backdrop click close the sheet;
- the menu lists Play/Pause/Resume/Skip/Previous/Repeat/Shuffle/Queue/Now
  playing/Stop/Custom with the resolved Jockie commands;
- Skip sends `m!skip` to the configured channel and shows `sent m!skip`;
- switching to JMusicBot updates the preview and menu and removes Previous;
- Play sends `!play Test Song Test Artist`;
- Custom command sends `!volume 20` and closes the sheet;
- `@Bot ` prefix and a `{prefix}loop` repeat override update the preview and
  formatted command; Reset restores the preset;
- switching to Custom clears the prefix and overrides and shows `!play`.

## 9. Out of scope

- Slash-command bots (Muse, MEE6, Green-bot).
- Bot tokens, webhooks, OAuth bots.
- Automatic detection in v0.8.0.
- Persisting a history of custom commands.
- Per-command arguments baked into presets; use Custom command or template
  overrides.
