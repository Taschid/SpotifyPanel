/**
 * @name SpotifyPanel
 * @description Docked Spotify controller panel for Discord, styled like the theme's other panels.
 * @version 0.8.6
 * @author jcode
 * @authorId 0
 */

const PLUGIN = "SpotifyPanel";
const { React } = BdApi;
const h = React.createElement;
const { useState, useEffect, useRef, useReducer } = React;

const DEFAULT_SETTINGS = {
  refreshToken: "",
  clientId: "",
  scope: "",
  musicChannelId: "",
  musicBotId: "jockie",
  musicBotPrefix: "",
  musicBotCommands: {},
  width: 420,
  height: 330,
  fullHeight: true,
  visible: true,
  hotkey: ["Alt", "e"],
  titlebarClearance: 146,
  topOffset: 12,
  volume: 60,
};

const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const DASHBOARD_URL = "https://developer.spotify.com/dashboard";
const REDIRECT_URI = "http://127.0.0.1:8899/callback/";
const AUTH_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-private",
  "user-library-read",
  "user-library-modify",
  "user-read-recently-played",
  "user-read-playback-position",
  "user-follow-read",
  "user-top-read",
];

// Prefix-command music bots. Commands are sent as the logged-in user; the
// plugin never needs a bot token or webhook. Sources (checked 2026-10-22):
//   jockiemusic.com/commands
//   jmusicbot.com/commands
//   just-some-bots.github.io/MusicBot/using/commands
// "M!" is Jockie, not Muse. Muse, MEE6 and Green-bot are slash-only and cannot
// be driven by plain messages.
const MUSIC_BOT_ACTIONS = [
  { id: "play", label: "Play current track", icon: "play" },
  { id: "pause", label: "Pause", icon: "pause" },
  { id: "resume", label: "Resume", icon: "play" },
  { id: "skip", label: "Skip", icon: "next" },
  { id: "previous", label: "Previous", icon: "prev" },
  { id: "repeat", label: "Repeat / loop", icon: "repeat" },
  { id: "shuffle", label: "Shuffle", icon: "shuffle" },
  { id: "queue", label: "Queue", icon: "queue" },
  { id: "nowPlaying", label: "Now playing", icon: "list" },
  { id: "stop", label: "Stop / leave", icon: "close" },
];

const MUSIC_BOTS = [
  {
    id: "jockie",
    label: "Jockie Music",
    prefix: "m!",
    note: "m! command prefix. Previous, queue, repeat and now playing supported.",
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
  },
  {
    id: "jmusicbot",
    label: "JMusicBot",
    prefix: "!",
    note: "Self-hosted. No previous command.",
    commands: {
      play: "{prefix}play {query}",
      pause: "{prefix}pause",
      resume: "{prefix}play",
      skip: "{prefix}skip",
      repeat: "{prefix}repeat on",
      shuffle: "{prefix}shuffle",
      queue: "{prefix}queue",
      nowPlaying: "{prefix}nowplaying",
      stop: "{prefix}stop",
    },
  },
  {
    id: "musicbot",
    label: "MusicBot (just-some-bots)",
    prefix: "!",
    note: "Self-hosted. No previous command.",
    commands: {
      play: "{prefix}play {query}",
      pause: "{prefix}pause",
      resume: "{prefix}resume",
      skip: "{prefix}skip",
      repeat: "{prefix}repeat all",
      shuffle: "{prefix}shuffle",
      queue: "{prefix}queue",
      nowPlaying: "{prefix}np",
      stop: "{prefix}disconnect",
    },
  },
  {
    id: "custom",
    label: "Custom bot",
    prefix: "!",
    note: "Edit the prefix and templates to match your bot's help output.",
    commands: {
      play: "{prefix}play {query}",
      pause: "{prefix}pause",
      resume: "{prefix}resume",
      skip: "{prefix}skip",
      previous: "{prefix}previous",
      repeat: "{prefix}repeat",
      shuffle: "{prefix}shuffle",
      queue: "{prefix}queue",
      nowPlaying: "{prefix}np",
      stop: "{prefix}stop",
    },
  },
];
const CSS = `
#spotifypanel-root { position: fixed; inset: 0; pointer-events: none; z-index: 150; }
#spotifypanel-panel {
  position: fixed;
  top: 12px;
  right: var(--gap, 12px);
  display: flex;
  flex-direction: column;
  background: rgba(47, 47, 47, 0.90);
  backdrop-filter: blur(6px) saturate(110%);
  color: var(--text-normal, #dbdee1);
  border: var(--border-thickness, 2px) solid var(--border-subtle, rgba(255, 255, 255, 0.2));
  border-radius: 0;
  box-sizing: border-box;
  pointer-events: auto;
  transition: border-color var(--border-hover-transition, 0.2s ease);
  font-family: var(--font, var(--font-primary, "gg sans", "Noto Sans", sans-serif));
  font-size: 14px;
  -webkit-app-region: no-drag;
  overflow: visible;
}
#spotifypanel-panel::after {
  content: 'spotify';
  display: block;
  color: var(--label-color, var(--text-muted));
  font-weight: var(--label-font-weight, 500);
  position: absolute;
  top: -10px;
  left: 8px;
  background-color: var(--background-base-low);
  padding: 0 4px;
  z-index: 100;
  font-size: 16px;
}
#spotifypanel-panel:hover { border-color: var(--border-hover, var(--accent-2, #ffffff)); }
#spotifypanel-panel:hover::after { color: var(--label-hover-color, var(--accent-2, #ffffff)); }
#spotifypanel-panel.sp-hidden { display: none; }
.sp-resize { position: absolute; left: 0; right: 0; bottom: -4px; height: 8px; cursor: n-resize; z-index: 3; }
/* Swallow pointer gestures in the gap on our left edge. Without this the
   panels underneath (members list / chat) still receive the drag and their
   resize border can be grabbed "through" the Spotify panel. */
.sp-edge {
  position: absolute;
  left: -12px;
  top: 0;
  bottom: 0;
  width: 14px;
  z-index: 4;
  cursor: default;
  background: transparent;
}
.sp-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  min-height: 30px;
  box-sizing: border-box;
  background: rgba(42, 42, 42, 0.90);
  border-bottom: 1px solid var(--border-subtle, #1f1f1f);
}
.sp-title {
  flex: 1;
  min-width: 0;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted, #949ba4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 20px;
  background: transparent;
  border: 0;
  color: var(--text-muted, #949ba4);
  font: inherit;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
}
.sp-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.sp-btn.sp-active { color: var(--accent-2, #fff); }
.sp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px 14px;
  overflow: hidden;
}
.sp-art {
  flex: 0 0 auto;
  background: #262626;
  object-fit: cover;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.14));
  box-sizing: border-box;
}
.sp-meta { width: 100%; min-width: 0; text-align: center; }
.sp-track {
  font-size: 15px;
  font-weight: 700;
  color: #f2f3f5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-artist {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-muted, #a8adb4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-progress-row { width: 100%; margin-top: 4px; }
.sp-progress { position: relative; height: 12px; display: flex; align-items: center; cursor: pointer; }
.sp-bar { position: relative; height: 3px; flex: 1; background: rgba(255, 255, 255, 0.16); }
.sp-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #fff; }
.sp-knob {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  margin-left: -3.5px;
  background: #fff;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.sp-progress:hover .sp-knob { opacity: 1; }
.sp-times {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--text-muted, #949ba4);
  font-variant-numeric: tabular-nums;
  margin-top: -4px;
}
.sp-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 100%;
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle, #1f1f1f);
}
.sp-controls .sp-btn {
  width: 30px;
  height: 30px;
  color: var(--text-muted, #b7bcc4);
  transition: color 0.15s ease, background 0.15s ease;
}
.sp-controls .sp-btn:hover { color: #fff; }
.sp-controls .sp-btn.sp-active { color: var(--accent-2, #fff); }
.sp-play-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  background: #f2f3f5;
  color: #121212;
  border: 0;
  cursor: pointer;
  padding: 0;
}
#spotifypanel-panel .sp-play-circle { border-radius: 50% !important; }
.sp-play-circle:hover { transform: scale(1.04); }
.sp-device-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 2px;
  max-width: 100%;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted, #949ba4);
}
.sp-device {
  padding: 2px 6px;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.14));
  cursor: pointer;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-device:hover { border-color: var(--accent-2, #fff); color: #fff; }
.sp-device.sp-current { border-color: rgba(255, 255, 255, 0.5); color: #f2f3f5; }
.sp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 8px 14px;
}
.sp-empty-main { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted, #949ba4); }
.sp-empty-sub { font-size: 11px; color: var(--text-muted, #949ba4); opacity: 0.75; max-width: 300px; }
.sp-error { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: #f0b232; }
.sp-icon { display: block; }
.sp-browse {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 10px 8px;
  gap: 6px;
}
.sp-tabs { display: flex; align-items: center; gap: 4px; }
.sp-tab {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted, #949ba4);
  background: transparent;
  border: 0;
  padding: 3px 6px;
  cursor: pointer;
}
.sp-tab:hover { color: #fff; }
.sp-tab.sp-tab-active { color: #fff; border-bottom: 1px solid #fff; }
.sp-search-input {
  flex: 1;
  min-width: 0;
  background: #262626;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.14));
  color: inherit;
  font: inherit;
  font-size: 11px;
  padding: 4px 7px;
  outline: none;
}
.sp-search-input:focus { border-color: var(--accent-2, #fff); }
.sp-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; margin: 0 -4px; padding: 0 4px; }
.sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px;
  cursor: pointer;
}
.sp-row:hover { background: rgba(255, 255, 255, 0.07); }
.sp-row-art { width: 28px; height: 28px; flex: 0 0 28px; object-fit: cover; background: #262626; }
.sp-row-main { flex: 1; min-width: 0; }
.sp-row-name { font-size: 11.5px; color: #f2f3f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-row-sub { font-size: 10px; color: var(--text-muted, #949ba4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-row-play { opacity: 0; color: #fff; font-size: 10px; letter-spacing: 0.08em; }
.sp-row:hover .sp-row-play { opacity: 0.9; }
.sp-browse-empty { font-size: 10.5px; color: var(--text-muted, #949ba4); padding: 8px 2px; }
.sp-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle, #1f1f1f);
}
.sp-mini .sp-row-name { font-size: 10.5px; }
/* ------------------------------------------------------------
   Flat skin, modelled on the "Flat Music Player" Rainmeter skin:
   single flat card, no header band, square art, mint progress
   accent, thin white icons with wide spacing, artist above title.
   These rules sit at the end of the sheet so they win on equal
   specificity without rewriting the base rules above.
   ------------------------------------------------------------ */
#spotifypanel-panel { background: rgba(20, 20, 20, 0.90); }
.sp-header {
  background: transparent;
  border-bottom: 0;
  padding: 6px 10px 0;
  min-height: 26px;
}
.sp-body { justify-content: flex-start; padding: 10px 14px 12px; gap: 8px; }
.sp-art { border: 0; background: #1f1f1f; }
.sp-artist { font-size: 13.5px; font-weight: 600; color: #fff; margin-top: 0; }
.sp-track { font-size: 11px; font-weight: 400; color: rgba(255, 255, 255, 0.55); margin-top: 2px; }
.sp-album { display: none; }
.sp-progress-row { margin-top: 2px; }
.sp-progress { height: 10px; }
.sp-bar { height: 2px; background: rgba(255, 255, 255, 0.32); }
.sp-fill { background: #2be285; }
.sp-knob { display: none; }
.sp-times { font-size: 8.5px; color: rgba(255, 255, 255, 0.45); margin-top: -2px; letter-spacing: 0.08em; }
.sp-controls { gap: 20px; margin-top: 4px; padding-top: 0; border-top: 0; }
.sp-controls .sp-btn { width: 26px; height: 26px; background: transparent; color: rgba(255, 255, 255, 0.62); }
.sp-controls .sp-btn:hover { color: #fff; background: transparent; }
.sp-controls .sp-btn.sp-active { color: #2be285; }
.sp-play-circle { width: 34px; height: 34px; background: transparent; color: #fff; box-shadow: none; }
#spotifypanel-panel .sp-play-circle { border-radius: 0 !important; }
.sp-play-circle:hover { color: #2be285; transform: none; }
.sp-device-row { margin-top: auto; opacity: 0.55; }
/* ------------------------------------------------------------
   Spotify-feel layout: artwork owns the top of the card, a left
   aligned title block, white progress, and a white circular play
   button in the transport row. Fills the whole panel height.
   ------------------------------------------------------------ */
#spotifypanel-panel {
  background: rgba(18, 18, 18, 0.94);
  backdrop-filter: blur(8px) saturate(110%);
}
.sp-header { padding: 8px 10px 0; min-height: 24px; }
.sp-body {
  padding: 6px 14px 12px;
  gap: 10px;
  justify-content: flex-start;
}
.sp-now {
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 0;
}
.sp-art {
  width: auto;
  border-radius: 6px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
}
.sp-meta { text-align: left; width: 100%; padding: 0 2px; }
.sp-track { font-size: 17px; font-weight: 700; color: #fff; letter-spacing: -0.01em; }
.sp-artist { font-size: 12.5px; font-weight: 400; color: rgba(255, 255, 255, 0.62); margin-top: 4px; }
.sp-progress-row { width: 100%; margin-top: auto; }
.sp-bar { height: 3px; background: rgba(255, 255, 255, 0.22); }
.sp-fill { background: #ffffff; }
.sp-progress:hover .sp-fill { background: #1ed760; }
.sp-times { font-size: 9px; color: rgba(255, 255, 255, 0.5); }
.sp-controls { gap: 28px; margin-top: 0; padding-top: 2px; }
.sp-controls .sp-btn { width: 28px; height: 28px; color: rgba(255, 255, 255, 0.55); }
.sp-controls .sp-btn:hover { color: #fff; }
.sp-controls .sp-btn.sp-active { color: #1ed760; }
.sp-play-circle {
  width: 52px;
  height: 52px;
  background: #ffffff;
  color: #121212;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}
#spotifypanel-panel .sp-play-circle { border-radius: 50% !important; }
.sp-play-circle:hover { background: #f2f2f2; color: #121212; transform: scale(1.03); }
.sp-device-row { margin-top: 0; opacity: 0.45; }

/* ------------------------------------------------------------
   Reference pass (2026-10-21): centered composition like the
   desktop player mock, and a transport bar that uses the full
   panel width instead of squeezing five controls into the
   middle. Shuffle and repeat sit at the outer edges, quiet and
   small; the play circle is the only bright element.
   ------------------------------------------------------------ */
.sp-body { padding: 14px 16px 12px; justify-content: center; }
.sp-now {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 14px;
}
.sp-art { align-self: center; border-radius: 0; flex: 0 0 auto; }
.sp-meta { text-align: center; padding: 0; }
.sp-track { font-size: 16.5px; font-weight: 700; letter-spacing: 0.01em; }
.sp-artist { font-size: 12px; color: rgba(255, 255, 255, 0.55); margin-top: 5px; }
.sp-progress-row { margin-top: 22px; }
.sp-progress { height: 14px; }
.sp-bar { height: 2px; background: rgba(255, 255, 255, 0.28); }
.sp-times {
  margin-top: 4px;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.38);
}
.sp-controls {
  justify-content: center;
  gap: clamp(12px, 6%, 26px);
  width: 100%;
  margin-top: 18px;
  padding: 0 4px;
  border-top: 0;
}
.sp-controls > * { flex: 0 0 auto; }
.sp-controls .sp-btn {
  width: 32px;
  height: 32px;
  color: rgba(255, 255, 255, 0.38);
}
.sp-controls .sp-btn:hover { color: #fff; }
.sp-controls .sp-btn.sp-active { color: #1ed760; }
.sp-play-circle {
  width: 54px;
  height: 54px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.sp-device-row { margin-top: 26px; padding-top: 0; opacity: 0.35; }

/* ------------------------------------------------------------
   Green reference pass (music-player-app-interface.avif):
   full-bleed artwork flush with the panel edges, shuffle and
   repeat lifted above the title, green accent on the artist,
   progress and times, white play circle with prev/next only.
   ------------------------------------------------------------ */
.sp-body { padding: 0 0 10px; }
.sp-sec, .sp-meta, .sp-progress-row, .sp-controls { width: 100%; box-sizing: border-box; }
.sp-art { border: 0; border-radius: 0; }
.sp-sec {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 18px 0;
  box-sizing: border-box;
}
.sp-sec .sp-btn {
  width: 22px;
  height: 22px;
  background: transparent;
  color: rgba(255, 255, 255, 0.32);
}
.sp-sec .sp-btn:hover { color: #fff; background: transparent; }
.sp-sec .sp-btn.sp-active { color: #1ed760; }
.sp-meta { padding: 0 18px; }
.sp-track { font-size: 16px; letter-spacing: 0.02em; }
.sp-artist { color: #1ed760; font-size: 11.5px; }
.sp-progress-row { padding: 0 18px; margin-top: 16px; }
.sp-bar { background: rgba(255, 255, 255, 0.16); }
.sp-fill { background: #1ed760; }
.sp-knob {
  display: block;
  opacity: 1;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 50%;
  background: #1ed760;
}
.sp-times { color: rgba(30, 215, 96, 0.7); }
.sp-controls {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0;
  margin-top: 20px;
  padding: 0 18px;
}
.sp-controls > :first-child { justify-self: start; }
.sp-controls > :last-child { justify-self: end; }
.sp-play-circle { width: 58px; height: 58px; background: #fff; color: #0d0d0d; }
.sp-device-row { margin-top: 22px; }

/* ------------------------------------------------------------
   Library / queue / volume furniture.
   ------------------------------------------------------------ */
.sp-tabs { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; flex-wrap: nowrap; }
.sp-tabs::-webkit-scrollbar { display: none; }
.sp-row-add {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.38);
  cursor: pointer;
}
.sp-row-add:hover { color: #1ed760; }
.sp-queue-label {
  font-size: 8.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  padding: 6px 2px 2px;
}
.sp-controls .sp-btn.sp-like-on,
.sp-vol .sp-btn.sp-like-on { color: #1ed760; }
.sp-controls .sp-btn.sp-like-on svg,
.sp-vol .sp-btn.sp-like-on svg { fill: currentColor; }
.sp-vol {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 18px;
  margin-top: 10px;
}
.sp-vol .sp-btn {
  width: 18px;
  height: 18px;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
}
.sp-vol-range {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 14px;
  background: transparent;
  cursor: pointer;
}
.sp-vol-range::-webkit-slider-runnable-track { height: 2px; background: rgba(255, 255, 255, 0.16); }
.sp-vol-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 8px;
  height: 8px;
  margin-top: -3px;
  border: 0;
  border-radius: 50%;
  background: #1ed760;
}
.sp-vol-range::-moz-range-track { height: 2px; background: rgba(255, 255, 255, 0.16); }
.sp-vol-range::-moz-range-thumb {
  width: 8px;
  height: 8px;
  border: 0;
  border-radius: 50%;
  background: #1ed760;
}

/* ------------------------------------------------------------
   Icon polish pass: one icon scale, real hit boxes, five equal
   transport slots, gutters aligned to the 18px text column and a
   single footer row for devices + volume.
   ------------------------------------------------------------ */
.sp-icon { display: block; flex: 0 0 auto; }

.sp-header { gap: 6px; padding: 6px 10px; }
.sp-header .sp-btn { width: 26px; height: 26px; border-radius: 2px; }
.sp-header .sp-btn:hover { background: rgba(255, 255, 255, 0.06); }

/* narrow panels: give the status line room back, drop the least useful button */
#spotifypanel-panel.sp-narrow .sp-header { gap: 4px; }
#spotifypanel-panel.sp-narrow .sp-header .sp-btn { width: 24px; }
#spotifypanel-panel.sp-narrow .sp-header .sp-btn.sp-ext { display: none; }

.sp-sec { padding: 8px 18px 0; }
.sp-sec .sp-btn { width: 28px; height: 28px; margin-inline: -4px; border-radius: 2px; }
.sp-sec .sp-btn:hover { background: transparent; }

.sp-controls {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  justify-items: center;
  align-items: center;
  gap: 0;
  margin-top: 16px;
  padding: 0 10px;
}
.sp-controls > * { justify-self: center; }
.sp-controls > :first-child { justify-self: center; }
.sp-controls > :last-child { justify-self: center; }
.sp-controls .sp-btn { width: 36px; height: 36px; border-radius: 50%; }
.sp-controls .sp-btn:hover { background: rgba(255, 255, 255, 0.07); }
.sp-play-circle { width: 56px; height: 56px; }
.sp-play-circle:hover { transform: none; background: #f4f4f4; }
.sp-play-circle .sp-tri { display: block; transform: translateX(-1.5px); }

.sp-foot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 18px;
  margin-top: 16px;
}
.sp-foot .sp-device-row {
  margin: 0;
  justify-content: flex-start;
  flex-wrap: nowrap;
  overflow: hidden;
  max-width: 100%;
}
.sp-foot .sp-vol {
  width: 100%;
  flex: 1 1 auto;
  margin: 0;
  padding: 0;
  justify-content: flex-start;
}
.sp-foot .sp-vol-range { flex: 1 1 auto; width: 100%; }
.sp-vol .sp-btn { width: 24px; height: 24px; }

.sp-track { font-size: 16px; }
.sp-progress-row { margin-top: 16px; }

/* ------------------------------------------------------------
   Modern mobile player pass: matte surface, no terminal chrome,
   geometric type, centred square art, thin green scrubber,
   outlined play circle, glow divider and docked mini bar.
   ------------------------------------------------------------ */
#spotifypanel-panel {
  border: 0;
  background: #121212;
  font-family: "Inter", "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
#spotifypanel-panel:hover { border-color: transparent; }
#spotifypanel-panel::after { display: none; }

.sp-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26px 20px 16px;
  box-sizing: border-box;
  background: transparent;
  border-bottom: 0;
}
.sp-nav .sp-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  color: #fff;
}
.sp-nav .sp-btn:hover { background: rgba(255, 255, 255, 0.06); }
.sp-nav .sp-btn.sp-active { color: #fff; }
.sp-nav .sp-btn.sp-like-on { color: #1DB954; }
.sp-nav-right { display: flex; align-items: center; gap: 6px; }
.sp-nav-back { justify-self: start; }

.sp-body { padding: 0 0 8px; justify-content: flex-start; gap: 0; }
.sp-now { flex: 1 1 auto; justify-content: center; }
.sp-now { gap: 0; }
.sp-art {
  margin: 12px auto 0;
  border: 0;
  border-radius: 8px;
  background: #00A859;
  box-shadow: none;
  object-fit: cover;
}
.sp-cover-empty { background: #00A859; }

.sp-info {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 24px;
  margin-top: 28px;
}
.sp-info .sp-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  color: #666;
}
.sp-info .sp-btn:hover { color: #fff; background: transparent; }
.sp-info .sp-btn.sp-active { color: #1DB954; }
.sp-meta {
  min-width: 0;
  text-align: center;
  padding: 0;
}
.sp-track {
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sp-artist {
  font-size: 14px;
  color: #999999;
  margin-top: 4px;
}

.sp-progress-row { padding: 0 24px; margin-top: 22px; box-sizing: border-box; }
.sp-progress { height: 16px; }
.sp-bar { height: 3px; background: #333333; }
.sp-fill { background: #1DB954; }
.sp-progress:hover .sp-fill { background: #1DB954; }
.sp-knob {
  display: block;
  opacity: 1;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background: #1DB954;
}
.sp-times {
  font-size: 12px;
  color: #888888;
  letter-spacing: 0;
  margin-top: 6px;
}

.sp-controls { padding: 0 24px; margin-top: 22px; }
.sp-controls .sp-btn { color: #666666; }
.sp-controls .sp-btn:hover { color: #FFFFFF; background: transparent; }
.sp-controls .sp-btn.sp-main-btn { color: #FFFFFF; }
.sp-controls .sp-btn.sp-like-on { color: #1DB954; }
.sp-controls .sp-btn.sp-star { color: #1DB954; }
.sp-controls .sp-btn.sp-send { color: #1DB954; }
.sp-notice {
  padding: 0 24px 6px;
  font-size: 11px;
  color: #1DB954;
}
.sp-settings-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 12px 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.sp-field-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #888888;
}
.sp-field-hint { font-size: 11px; color: #777777; }
.sp-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sp-play-circle {
  width: 56px;
  height: 56px;
  background: transparent;
  border: 1.5px solid #FFFFFF;
  color: #FFFFFF;
  box-shadow: none;
}
.sp-play-circle:hover { background: rgba(255, 255, 255, 0.08); color: #FFFFFF; }
.sp-play-circle .sp-tri { display: block; transform: translateX(1.5px); }

.sp-dock-icons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  padding: 0 24px;
  margin-top: 0;
  padding-top: 9px;
}
.sp-dock-icons .sp-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  color: #666666;
}
.sp-dock-icons .sp-btn:hover { color: #FFFFFF; }
.sp-btn.sp-disabled { opacity: 0.45; cursor: default; }
.sp-glow-line {
  height: 1px;
  width: 100%;
  margin: 6px 0 0;
  background: linear-gradient(90deg, rgba(29, 185, 84, 0) 0%, #1DB954 50%, rgba(29, 185, 84, 0) 100%);
  box-shadow: 0 0 12px rgba(29, 185, 84, 0.55);
}
.sp-dock {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 20px;
  background: #1C1C1C;
}
.sp-dock-play {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #1DB954;
  color: #06110a;
  cursor: pointer;
}
.sp-dock-play:hover { background: #1ed760; }
.sp-dock-text {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 13px;
  color: #d9d9d9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-dock .sp-btn {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  background: transparent;
  color: #888888;
}
.sp-dock .sp-btn:hover { color: #FFFFFF; }

.sp-menu {
  position: absolute;
  top: 46px;
  right: 16px;
  z-index: 20;
  width: 214px;
  box-sizing: border-box;
  padding: 8px;
  background: #1C1C1C;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
}
.sp-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #e6e6e6;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.sp-menu-item:hover { background: rgba(255, 255, 255, 0.06); }
.sp-menu-sep { height: 1px; background: rgba(255, 255, 255, 0.08); margin: 6px 4px; }
.sp-menu-vol { display: flex; align-items: center; gap: 8px; padding: 6px 10px 4px; }
.sp-menu-vol .sp-btn { width: 20px; height: 20px; color: #888888; background: transparent; }
.sp-volume-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 0 18px; margin-top: 6px; box-sizing: border-box; opacity: .9;
}
.sp-volume-row:hover { opacity: 1; }
.sp-volume-row .sp-btn {
  width: 22px; height: 22px; padding: 0; border: 0; background: transparent;
  color: rgba(255, 255, 255, .7); display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.sp-volume-row .sp-btn:hover { color: #fff; }
.sp-volume-row .sp-vol-range {
  flex: 1 1 auto;
  height: 14px;
  background-image: linear-gradient(#1ed760, #1ed760), linear-gradient(rgba(255, 255, 255, .16), rgba(255, 255, 255, .16));
  background-repeat: no-repeat;
  background-position: 0 50%, 0 50%;
  background-size: 60% 2px, 100% 2px;
  transition: background-size .12s linear;
}
.sp-volume-row .sp-vol-range::-webkit-slider-runnable-track { height: 2px; background: transparent; }
.sp-volume-row .sp-vol-range::-moz-range-track { height: 2px; background: transparent; }
.sp-volume-row .sp-vol-range::-webkit-slider-thumb {
  width: 10px; height: 10px; margin-top: -4px; border-radius: 50%;
  background: #fff; border: 0; box-shadow: 0 0 0 1px rgba(0, 0, 0, .35);
}
.sp-volume-row .sp-vol-range::-moz-range-thumb {
  width: 10px; height: 10px; border-radius: 50%;
  background: #fff; border: 0; box-shadow: 0 0 0 1px rgba(0, 0, 0, .35);
}
.sp-menu-vol .sp-vol-range {
  height: 14px;
  background-image: linear-gradient(#1ed760, #1ed760), linear-gradient(rgba(255, 255, 255, .16), rgba(255, 255, 255, .16));
  background-repeat: no-repeat;
  background-position: 0 50%, 0 50%;
  background-size: 60% 2px, 100% 2px;
  transition: background-size .12s linear;
}
.sp-menu-vol .sp-vol-range::-webkit-slider-runnable-track { height: 2px; background: transparent; }
.sp-vol-pct { min-width: 30px; text-align: right; font-size: 10px; color: rgba(255, 255, 255, .5); }
.sp-menu-devices { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 10px 6px; }

/* ------------------------------------------------------------
   Library pass: docked mini-player, bottom nav, card grid and
   the reference tracklist header.
   ------------------------------------------------------------ */
.sp-browse { padding: 6px 10px 8px; }
.sp-browse-col { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.sp-browse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 6px;
}
.sp-browse-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #888888;
}
.sp-textbtn {
  border: 0;
  background: transparent;
  color: #1DB954;
  font: inherit;
  font-size: 12px;
  padding: 4px 6px;
  cursor: pointer;
}
.sp-textbtn:hover { color: #1ed760; }
.sp-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 4px 6px;
}

.sp-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 16px;
}
.sp-card { cursor: pointer; text-align: center; }
.sp-card-art {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #1C1C1C;
}
.sp-card-title {
  margin-top: 8px;
  font-size: 14px;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-card-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #888888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sp-detail { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.sp-detail-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 24px 16px;
}
.sp-detail-cover {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: 8px;
  background: #1C1C1C;
}
.sp-dots { display: flex; align-items: center; gap: 5px; }
.sp-dot { width: 5px; height: 5px; border-radius: 50%; background: #333333; }
.sp-dot-on { background: #1DB954; }
.sp-detail-actions { display: flex; align-items: center; gap: 10px; }
.sp-pill {
  max-width: 240px;
  padding: 8px 20px;
  border-radius: 999px;
  background: #1DB954;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-detail-play {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #1DB954;
  color: #06110a;
  cursor: pointer;
}
.sp-detail-play:hover { background: #1ed760; }
.sp-detail-play svg { display: block; transform: translateX(1px); }
.sp-detail-playrow { padding: 2px 2px 8px; }
.sp-detail-playtext {
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 999px;
  background: #1DB954;
  color: #FFFFFF;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}
.sp-detail-playtext:hover { background: #1ed760; }

.sp-trackrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  cursor: pointer;
}
.sp-trackrow-title {
  font-size: 14px;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-trackrow-artist {
  margin-top: 2px;
  font-size: 12px;
  color: #888888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-row-actions { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
.sp-row-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #888888;
  cursor: pointer;
}
.sp-row-icon:hover { color: #FFFFFF; }
.sp-row-icon-on { color: #1DB954; }

/* mini-player */
.sp-mini {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  height: 64px;
  padding: 0 16px;
  background: #1C1C1C;
  border-top: 0;
  cursor: pointer;
}
.sp-mini:hover { background: #252525; }
.sp-mini-play {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #1DB954;
  color: #FFFFFF;
  cursor: pointer;
}
.sp-mini-play:hover { background: #1ed760; }
.sp-mini-text {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 13px;
  color: #A0A0A0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-mini-text strong { color: #FFFFFF; font-weight: 700; }
.sp-mini-chev { flex: 0 0 auto; display: flex; color: #FFFFFF; }

/* bottom navigation */
.sp-navbar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
  height: 56px;
  background: #141414;
  border-top: 1px solid #282828;
}
.sp-navitem {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 100%;
  border: 0;
  background: transparent;
  color: #888888;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.sp-navitem:hover { color: #FFFFFF; }
.sp-navitem-active { color: #FFFFFF; }
.sp-navlabel { font-size: 10px; letter-spacing: 0.02em; }

/* ------------------------------------------------------------
   v0.6.0: dock pinned to the bottom, library slides up, nav row
   sits below Discord's titlebar band so the X never lands on it.
   ------------------------------------------------------------ */
.sp-nav { padding: 34px 16px 12px; }
.sp-body { padding: 0; }
.sp-body .sp-mini { margin-top: auto; }
.sp-mini-chev {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #FFFFFF;
  cursor: pointer;
}
.sp-mini-chev:hover { color: #1DB954; }

/* ------------------------------------------------------------
   v0.7.0: bring-your-own Spotify app setup and onboarding.
   ------------------------------------------------------------ */
.sp-setup { display: flex; flex-direction: column; gap: 10px; padding: 6px 24px 18px; }
.sp-setup-title { font-size: 16px; font-weight: 700; color: #FFFFFF; }
.sp-setup-step { font-size: 12px; line-height: 1.5; color: #B3B3B3; }
.sp-setup-step strong { color: #FFFFFF; font-weight: 600; }
.sp-link {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: #1DB954;
  text-decoration: none;
  cursor: pointer;
}
.sp-link:hover { color: #1ED760; text-decoration: underline; }
.sp-code {
  display: inline-block;
  font-family: ui-monospace, Consolas, "Courier New", monospace;
  font-size: 10.5px;
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  padding: 3px 6px;
  word-break: break-all;
}
.sp-code-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sp-settings-heading {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1DB954;
  margin-top: 4px;
}
.sp-settings-sep { height: 1px; background: rgba(255, 255, 255, 0.08); margin: 10px 0 2px; }
.sp-status-ok { color: #1DB954; }
.sp-status-bad { color: #F0B232; }
.sp-primary-btn {
  align-self: flex-start;
  border: 0;
  border-radius: 999px;
  background: #1DB954;
  color: #0B0B0B;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 18px;
  cursor: pointer;
}
.sp-primary-btn:hover { background: #1ED760; }
.sp-primary-btn:disabled { opacity: 0.55; cursor: default; }
.sp-paste-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
}

/* ------------------------------------------------------------
   v0.8.0: music bot selector, template editor, command menu.
   ------------------------------------------------------------ */
.sp-select {
  width: 100%;
  box-sizing: border-box;
  background: #262626;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.14));
  border-radius: 3px;
  color: inherit;
  font: inherit;
  font-size: 11px;
  padding: 5px 7px;
  outline: none;
}
.sp-template-list { display: flex; flex-direction: column; gap: 8px; padding: 2px 0; }
.sp-template-row { display: flex; flex-direction: column; gap: 3px; }
.sp-botmenu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 29;
  background: rgba(0, 0, 0, 0.45);
}
.sp-botmenu {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 92px;
  z-index: 30;
  max-height: calc(100% - 104px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 8px;
  background: #1C1C1C;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
}
.sp-botmenu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 8px;
}
.sp-botmenu-title { font-size: 12.5px; font-weight: 700; color: #FFFFFF; }
.sp-botmenu-sub { font-size: 10px; color: #8A8A8A; margin-top: 1px; }
.sp-botmenu-notice {
  padding: 0 8px 8px;
  font-size: 10.5px;
  line-height: 1.35;
  word-break: break-word;
}
.sp-botmenu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #E6E6E6;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.sp-botmenu-item:hover { background: rgba(255, 255, 255, 0.07); }
.sp-botmenu-item > span:first-child { min-width: 0; }
.sp-botmenu-cmd {
  max-width: 62%;
  overflow-wrap: anywhere;
  font-family: ui-monospace, Consolas, "Courier New", monospace;
  font-size: 10px;
  color: #8F8F8F;
  text-align: right;
}
.sp-botmenu-custom { display: flex; flex-direction: column; gap: 6px; padding: 6px 4px 2px; }
.sp-botmenu-custom-row { display: flex; align-items: center; gap: 8px; }

@keyframes sp-rise {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.sp-browse { animation: sp-rise 180ms ease-out; }

/* ------------------------------------------------------------
   v0.8.5: one player structure for every view. Elapsed and total
   times flank a draggable seek rail (YouTube-panel rail styling,
   volume-slider thumb), and the docked player is the same tree at
   a smaller scale instead of a separate mini-player.
   ------------------------------------------------------------ */
.sp-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  box-sizing: border-box;
}
.sp-player .sp-info { flex: 0 0 auto; }
.sp-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0 24px;
  margin-top: 22px;
  box-sizing: border-box;
}
.sp-time {
  flex: 0 0 auto;
  min-width: 32px;
  font-size: 11px;
  color: #888888;
  font-variant-numeric: tabular-nums;
}
.sp-time:last-child { text-align: right; }
.sp-seek {
  -webkit-appearance: none;
  appearance: none;
  flex: 1 1 auto;
  min-width: 0;
  height: 16px;
  margin: 0;
  padding: 0;
  border: 0;
  background-color: transparent;
  background-image: linear-gradient(#1DB954, #1DB954), linear-gradient(#333333, #333333);
  background-repeat: no-repeat;
  background-position: 0 50%, 0 50%;
  background-size: 0 3px, 100% 3px;
  cursor: pointer;
}
.sp-seek::-webkit-slider-runnable-track { height: 3px; background: transparent; border: 0; }
.sp-seek::-moz-range-track { height: 3px; background: transparent; border: 0; }
.sp-seek::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 11px;
  height: 11px;
  margin-top: -4px;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.sp-seek::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.sp-seek:hover::-webkit-slider-thumb { background: #1ed760; }
.sp-seek:hover::-moz-range-thumb { background: #1ed760; }
`;

function openExternal(url) {
  try {
    if (typeof require === "function") {
      const { shell } = require("electron");
      if (shell && typeof shell.openExternal === "function") {
        shell.openExternal(url);
        return true;
      }
    }
  } catch {}
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {}
  try { window.open(url, "_blank", "noopener"); return true; } catch {}
  return false;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {}
  return false;
}

// Accepts a full redirect URL, a query string, or a bare authorization code.
function parseAuthRedirect(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    try {
      const qs = new URLSearchParams(raw.replace(/^[?#]+/, ""));
      const code = qs.get("code");
      const state = qs.get("state");
      const error = qs.get("error");
      if (code || state || error) return { code, state, error };
      return { code: raw, state: null, error: null };
    } catch {
      return { code: raw, state: null, error: null };
    }
  }
  try {
    const url = new URL(raw);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    return {
      code: url.searchParams.get("code") || hash.get("code"),
      state: url.searchParams.get("state") || hash.get("state"),
      error: url.searchParams.get("error") || hash.get("error"),
    };
  } catch {
    return null;
  }
}

class SpotifyPanel {
  constructor(meta) {
    this.meta = meta;
    this.bd = typeof BdApi === "function" ? new BdApi(PLUGIN) : BdApi;
    this.settings = { ...DEFAULT_SETTINGS, ...(this.bd.Data.load("settings") || {}) };
    this.accessToken = null;
    this.expiresAt = 0;
    this._bump = null;
    this._reactRoot = null;
    this._rootEl = null;
    this._hotAbort = null;
    this._hotKeys = new Set();
    this._hotFired = false;
    this._timer = null;
  }

  log(...args) {
    try { (this.bd?.Logger || BdApi.Logger).info("[spotify]", ...args); } catch {}
  }

  save() {
    try { this.bd.Data.save("settings", this.settings); } catch {}
  }

  // ------------------------------------------------------- spotify app login
  // Bring-your-own-app PKCE flow. The user creates a free Spotify app once,
  // registers REDIRECT_URI, pastes the Client ID, and the panel handles the
  // rest through a loopback listener and the system browser.
  b64url(bytes) {
    return Buffer.from(bytes).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async makePkce() {
    let webcrypto = globalThis.crypto;
    if (!webcrypto || !webcrypto.subtle) {
      webcrypto = require("crypto").webcrypto;
    }
    const bytes = new Uint8Array(64);
    webcrypto.getRandomValues(bytes);
    const verifier = this.b64url(bytes);
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const stateBytes = new Uint8Array(16);
    webcrypto.getRandomValues(stateBytes);
    return { verifier, challenge: this.b64url(new Uint8Array(digest)), state: this.b64url(stateBytes) };
  }

  buildAuthUrl(clientId, challenge, state, redirectUri = REDIRECT_URI) {
    const params = new URLSearchParams({
      client_id: String(clientId || "").trim(),
      response_type: "code",
      redirect_uri: redirectUri,
      scope: AUTH_SCOPES.join(" "),
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });
    return AUTH_URL + "?" + params.toString();
  }

  hasLoopback() {
    try {
      if (typeof require !== "function") return false;
      const http = require("http");
      return !!(http && typeof http.createServer === "function");
    } catch {
      return false;
    }
  }

  // Keep PKCE material between opening the browser and the user pasting the
  // redirected URL back. Used when this Discord build has no Node http.
  beginAuth(clientId) {
    const id = String(clientId || "").trim();
    if (!id) return { ok: false, error: "paste your Spotify Client ID first" };
    return this.makePkce().then((pkce) => {
      this._pendingAuth = {
        clientId: id,
        verifier: pkce.verifier,
        state: pkce.state,
        createdAt: Date.now(),
      };
      const url = this.buildAuthUrl(id, pkce.challenge, pkce.state);
      this._pendingAuth.url = url;
      return { ok: true, url };
    }).catch((e) => ({ ok: false, error: e?.message || "could not start login" }));
  }

  async exchangeCode(clientId, code, verifier) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.refresh_token) {
      return {
        ok: false,
        error: data.error_description || data.error || ("HTTP " + r.status),
      };
    }
    this.settings.clientId = clientId;
    this.settings.refreshToken = data.refresh_token;
    if (typeof data.scope === "string") this.settings.scope = data.scope;
    this.accessToken = data.access_token || null;
    this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    this.save();
    this.log("connected spotify account");
    return { ok: true };
  }

  async completeAuth(input) {
    const pending = this._pendingAuth;
    if (!pending) return { ok: false, error: "press Connect Spotify first" };
    if (Date.now() - pending.createdAt > 15 * 60 * 1000) {
      this._pendingAuth = null;
      return { ok: false, error: "login expired - press Connect Spotify again" };
    }

    const parsed = parseAuthRedirect(input);
    if (!parsed) return { ok: false, error: "paste the URL from the browser's address bar" };
    if (parsed.error) return { ok: false, error: parsed.error };
    if (!parsed.code) return { ok: false, error: "that URL has no code parameter" };
    if (parsed.state && parsed.state !== pending.state) {
      return { ok: false, error: "state mismatch - the login did not come from this panel" };
    }

    const res = await this.exchangeCode(pending.clientId, parsed.code, pending.verifier);
    if (res.ok) this._pendingAuth = null;
    return res;
  }

  async connectSpotify(clientId) {
    const id = String(clientId || "").trim();
    if (!id) return { ok: false, error: "paste your Spotify Client ID first" };
    if (this._authServer) return { ok: false, error: "already waiting for Spotify in the browser" };

    let http;
    try { http = require("http"); } catch {
      return { ok: false, error: "node http is unavailable in this Discord build" };
    }

    const pkce = await this.makePkce();
    const server = http.createServer();
    this._authServer = server;

    return new Promise((resolve) => {
      let done = false;
      let timer = 0;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this._authServer = null;
        try { server.close(); } catch {}
        resolve(result);
      };

      server.on("error", (e) => {
        finish({ ok: false, error: "port 8899 is busy (" + (e?.message || "in use") + "). Close the other auth helper and retry." });
      });

      server.on("request", async (req, res) => {
        let url;
        try { url = new URL(req.url, REDIRECT_URI); } catch {
          res.writeHead(400);
          res.end();
          return;
        }
        if (!url.pathname.startsWith("/callback")) {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get("code");
        const authError = url.searchParams.get("error");
        const gotState = url.searchParams.get("state");
        let page = "Spotify connected. You can close this tab and return to Discord.";
        let result;

        if (authError) {
          page = "Spotify did not grant access. Return to Discord for details.";
          result = { ok: false, error: authError };
        } else if (gotState !== pkce.state) {
          page = "Login rejected: state mismatch. Return to Discord and try again.";
          result = { ok: false, error: "state mismatch - login rejected" };
        } else if (!code) {
          page = "No authorization code was returned. Return to Discord and try again.";
          result = { ok: false, error: "no authorization code returned" };
        } else {
          try {
            result = await this.exchangeCode(id, code, pkce.verifier);
            if (!result.ok) page = "Token exchange failed. Return to Discord for details.";
          } catch (e) {
            page = "Token exchange failed. Return to Discord for details.";
            result = { ok: false, error: e?.message || "token exchange failed" };
          }
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'><title>SpotifyPanel</title></head>" +
          "<body style='font-family:Segoe UI,sans-serif;background:#191414;color:#fff;padding:40px'>" +
          "<h2>SpotifyPanel</h2><p>" + page + "</p></body></html>"
        );
        finish(result);
      });

      server.listen(8899, "127.0.0.1", () => {
        const authUrl = this.buildAuthUrl(id, pkce.challenge, pkce.state);
        this.log("waiting for spotify login: " + REDIRECT_URI);
        if (!openExternal(authUrl)) {
          finish({ ok: false, error: "could not open the browser; open the Spotify dashboard manually" });
        }
      });

      if (!done) {
        timer = setTimeout(
          () => finish({ ok: false, error: "timed out waiting for the Spotify login" }),
          180000
        );
      }
    });
  }

  disconnectSpotify() {
    this.settings.refreshToken = "";
    this.settings.scope = "";
    this.accessToken = null;
    this.expiresAt = 0;
    this.save();
    this.log("spotify disconnected");
  }

  // ------------------------------------------------------------------ auth
  async refreshToken(force = false) {
    if (!force && this.accessToken && Date.now() < this.expiresAt - 60000) return this.accessToken;
    if (!this.settings.refreshToken) throw new Error("not connected");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.settings.refreshToken,
      client_id: this.settings.clientId,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      const msg = data.error_description || data.error || ("HTTP " + res.status);
      this.log("token refresh failed: " + msg);
      throw new Error(msg);
    }
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    // Spotify returns the granted scopes on refresh; keep them so the UI can say
    // which parts of the panel the current token can actually use.
    if (typeof data.scope === "string") this.settings.scope = data.scope;
    if (data.refresh_token && data.refresh_token !== this.settings.refreshToken) {
      this.settings.refreshToken = data.refresh_token;
    }
    this.save();
    this.log("token refreshed; len=" + String(this.accessToken).length + " expiresIn=" + (data.expires_in || "?"));
    return this.accessToken;
  }

  async api(path, options = {}) {
    const token = await this.refreshToken();
    const url = API + path;
    const doFetch = (bearer) => fetch(url, {
      method: options.method || "GET",
      headers: {
        Authorization: "Bearer " + bearer,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let res = await doFetch(token);
    if (res.status === 401) {
      const fresh = await this.refreshToken(true);
      res = await doFetch(fresh);
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      let detail = "";
      let reason = "";
      try {
        const data = await res.json();
        detail = data?.error?.message || data?.error || "";
        reason = data?.error?.reason || "";
      } catch {}
      const err = new Error(detail || ("HTTP " + res.status));
      err.status = res.status;
      err.reason = reason;
      throw err;
    }
    if (options.raw) return res;
    return res.json().catch(() => null);
  }

  async getPlayer() {
    return this.api("/me/player");
  }

  async getDevices() {
    const data = await this.api("/me/player/devices");
    return Array.isArray(data?.devices) ? data.devices : [];
  }

  async send(path, options = {}) {
    const attempt = async (opts) => {
      try {
        await this.api(path, opts);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || "failed", status: e?.status, reason: e?.reason };
      }
    };

    let res = await attempt(options);

    // Spotify's edge rejects bodyless POST/PUT with 411 when no Content-Length
    // reaches it. Retry with an empty JSON object so a length is always sent.
    if (!res.ok && res.status === 411 && !(options && options.body)) {
      res = await attempt({ ...(options || {}), body: {} });
    }

    // A command with no active device does nothing. Wake the first Spotify
    // device on the account and retry once. Transfer is silent unless this is
    // an explicit play command.
    if (!res.ok && res.reason === "NO_ACTIVE_DEVICE") {
      let devices = [];
      try { devices = await this.getDevices(); } catch {}
      const target = devices.find((d) => d && d.id && !d.is_restricted) || devices.find((d) => d && d.id);
      if (target) {
        const wantPlay = /\/me\/player\/play(\?|$)/.test(path);
        let woke = false;
        try {
          await this.api("/me/player", {
            method: "PUT",
            body: { device_ids: [target.id], play: wantPlay },
          });
          woke = true;
        } catch {}
        if (woke) {
          this.log("woke device " + (target.name || target.id) + " for " + path);
          await new Promise((r) => setTimeout(r, 400));
          res = await attempt(options);
        }
      }
    }

    return res;
  }

  play() { return this.send("/me/player/play", { method: "PUT" }); }
  pause() { return this.send("/me/player/pause", { method: "PUT" }); }
  next() { return this.send("/me/player/next", { method: "POST" }); }
  previous() { return this.send("/me/player/previous", { method: "POST" }); }
  seek(positionMs) { return this.send("/me/player/seek?position_ms=" + Math.max(0, Math.round(positionMs)), { method: "PUT" }); }
  setVolume(percent) { return this.send("/me/player/volume?volume_percent=" + Math.round(percent), { method: "PUT" }); }
  setShuffle(state) { return this.send("/me/player/shuffle?state=" + !!state, { method: "PUT" }); }
  setRepeat(state) { return this.send("/me/player/repeat?state=" + state, { method: "PUT" }); }
  transfer(deviceId) {
    return this.send("/me/player", { method: "PUT", body: { device_ids: [deviceId], play: true } });
  }

  // ---------------------------------------------------------------- library
  async getPlaylists() {
    const data = await this.api("/me/playlists?limit=50");
    return Array.isArray(data?.items) ? data.items.filter(Boolean) : [];
  }

  async getPlaylistTracks(playlistId) {
    const data = await this.api("/playlists/" + playlistId + "/tracks?limit=100");
    return (Array.isArray(data?.items) ? data.items : [])
      .map((entry) => entry?.track)
      .filter(Boolean);
  }

  async searchTracks(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const data = await this.api("/search?type=track&limit=20&q=" + encodeURIComponent(q));
    return Array.isArray(data?.tracks?.items) ? data.tracks.items.filter(Boolean) : [];
  }

  playContext(contextUri) {
    return this.send("/me/player/play", { method: "PUT", body: { context_uri: contextUri } });
  }

  playTrack(trackUri) {
    return this.send("/me/player/play", { method: "PUT", body: { uris: [trackUri] } });
  }

  // Play a slice of a visible list, starting at `offset`. Passing the whole
  // list (instead of one uri) is what gives Spotify a real queue, so the
  // panel's prev/next buttons have somewhere to go.
  playTracks(uris, offset = 0) {
    const list = (uris || []).filter(Boolean);
    if (!list.length) return Promise.resolve({ ok: false, error: "nothing to play" });
    const position = Math.max(0, Math.min(list.length - 1, offset));
    return this.send("/me/player/play", {
      method: "PUT",
      body: { uris: list, offset: { position } },
    });
  }

  async getSavedTracks(limit = 50) {
    const data = await this.api("/me/tracks?limit=" + limit);
    return (Array.isArray(data?.items) ? data.items : []).map((i) => i?.track).filter(Boolean);
  }

  async getSavedAlbums(limit = 50) {
    const data = await this.api("/me/albums?limit=" + limit);
    return (Array.isArray(data?.items) ? data.items : []).map((i) => i?.album).filter(Boolean);
  }

  async getFollowedArtists(limit = 50) {
    const data = await this.api("/me/following?type=artist&limit=" + limit);
    const items = data?.artists?.items;
    return Array.isArray(items) ? items.filter(Boolean) : [];
  }

  async getRecent(limit = 30) {
    const data = await this.api("/me/player/recently-played?limit=" + limit);
    return (Array.isArray(data?.items) ? data.items : []).map((i) => i?.track).filter(Boolean);
  }

  async getAlbumTracks(albumId) {
    const data = await this.api("/albums/" + albumId + "/tracks?limit=50");
    return Array.isArray(data?.items) ? data.items.filter(Boolean) : [];
  }

  async getArtistTopTracks(artistId) {
    const data = await this.api("/artists/" + artistId + "/top-tracks?market=from_token");
    return Array.isArray(data?.tracks) ? data.tracks.filter(Boolean) : [];
  }

  async getQueue() {
    const data = await this.api("/me/player/queue");
    return {
      current: data?.currently_playing || null,
      upcoming: Array.isArray(data?.queue) ? data.queue.filter(Boolean) : [],
    };
  }

  async isTrackSaved(id) {
    if (!id) return false;
    const data = await this.api("/me/tracks/contains?ids=" + encodeURIComponent(id));
    return Array.isArray(data) ? !!data[0] : false;
  }

  hasScope(name) {
    const scope = this.settings.scope;
    if (typeof scope !== "string" || !scope) return null;
    return scope.split(/\s+/).includes(name);
  }

  needsLibraryScopes() {
    return this.hasScope("user-library-read") === false;
  }

  saveTrack(id, on) {
    return this.send("/me/tracks?ids=" + encodeURIComponent(id), { method: on ? "PUT" : "DELETE" });
  }

  addToQueue(uri) {
    return this.send("/me/player/queue?uri=" + encodeURIComponent(uri), { method: "POST" });
  }

  // ------------------------------------------------------- discord bridge
  currentChannelId() {
    try {
      const wp = BdApi.Webpack;
      if (!wp) return "";
      const store = (wp.getByProps && wp.getByProps("getChannelId", "getLastSelectedChannelId"))
        || (wp.getByProps && wp.getByProps("getChannelId"));
      const id = store && store.getChannelId && store.getChannelId();
      return id ? String(id) : "";
    } catch {
      return "";
    }
  }

  messageModule() {
    try {
      const wp = BdApi.Webpack;
      if (!wp) return null;
      const byKeys = wp.getByKeys && wp.getByKeys("sendMessage", "receiveMessage");
      if (byKeys && typeof byKeys.sendMessage === "function") return byKeys;
      const byProps = wp.getByProps && wp.getByProps("sendMessage");
      if (byProps && typeof byProps.sendMessage === "function") return byProps;
      const found = wp.getModule && wp.getModule((m) => m && typeof m.sendMessage === "function", { searchExports: true });
      return found && typeof found.sendMessage === "function" ? found : null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------- discord bots
  musicBotProfile() {
    const preset = MUSIC_BOTS.find((b) => b.id === this.settings.musicBotId) || MUSIC_BOTS[0];
    const overrides = this.settings.musicBotCommands;
    const commands = { ...preset.commands };
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
      for (const action of MUSIC_BOT_ACTIONS) {
        if (Object.prototype.hasOwnProperty.call(overrides, action.id)) {
          commands[action.id] = overrides[action.id] == null ? "" : String(overrides[action.id]);
        }
      }
    }
    return {
      id: preset.id,
      label: preset.label,
      note: preset.note,
      prefix: String(this.settings.musicBotPrefix || preset.prefix),
      commands,
    };
  }

  musicBotActionList() {
    const profile = this.musicBotProfile();
    return MUSIC_BOT_ACTIONS
      .filter((a) => String(profile.commands[a.id] || "").trim())
      .map((a) => ({ ...a, template: String(profile.commands[a.id]).trim() }));
  }

  musicBotVars(track) {
    const title = track?.name || "";
    const names = Array.isArray(track?.artists)
      ? track.artists.map((a) => a && a.name).filter(Boolean)
      : [];
    const artist = names.join(", ");
    // Search query requested by the user: track name followed by the artist(s).
    const query = [title, ...names].filter(Boolean).join(" ").trim();
    return {
      prefix: this.musicBotProfile().prefix,
      query,
      title,
      artist,
      artists: names.join(" "),
      album: track?.album?.name || "",
      url: track?.external_urls?.spotify || "",
      uri: track?.uri || "",
    };
  }

  formatMusicCommand(action, track) {
    const profile = this.musicBotProfile();
    const template = profile.commands[action];
    if (!template || !String(template).trim()) return "";
    const vars = this.musicBotVars(track);
    return String(template)
      .replace(/\{(\w+)\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m))
      .replace(/\s+/g, " ")
      .trim();
  }

  // Zero added throttle: commands are chained so rapid clicks keep their order,
  // but a send never waits on a timer. Discord's own rate limits still apply.
  enqueueMusicSend(channelId, content) {
    const job = () => this.deliverMusicMessage(channelId, content);
    const run = (this._sendChain || Promise.resolve()).then(job, job);
    this._sendChain = run.catch(() => {});
    return run;
  }

  async deliverMusicMessage(channelId, content) {
    const actions = this.messageModule();
    if (!actions) return { ok: false, error: "could not reach discord's message module", content };
    try {
      const out = actions.sendMessage(channelId, { content }, undefined, {});
      if (out && typeof out.then === "function") {
        const res = await out.catch((e) => ({ error: e }));
        if (res && res.error) {
          return { ok: false, error: res.error.message || "send failed", content };
        }
      }
      this.log("sent bot command: " + content + " to " + channelId);
      return { ok: true, content };
    } catch (e) {
      return { ok: false, error: e?.message || "send failed", content };
    }
  }

  sendMusicCommand(action, track) {
    const channelId = String(this.settings.musicChannelId || "").trim();
    if (!channelId) return Promise.resolve({ ok: false, error: "set a music channel id in the plugin settings" });
    if (action === "play" && !track?.name) return Promise.resolve({ ok: false, error: "nothing playing" });
    const content = this.formatMusicCommand(action, track);
    if (!content) return Promise.resolve({ ok: false, error: "this bot has no " + action + " command configured" });
    return this.enqueueMusicSend(channelId, content);
  }

  sendRawMusicCommand(text) {
    const channelId = String(this.settings.musicChannelId || "").trim();
    if (!channelId) return Promise.resolve({ ok: false, error: "set a music channel id in the plugin settings" });
    const content = String(text || "").trim();
    if (!content) return Promise.resolve({ ok: false, error: "command is empty" });
    return this.enqueueMusicSend(channelId, content);
  }

  // Compatibility wrapper used by older call sites/tests.
  sendToMusicChannel(songName) {
    return this.sendMusicCommand("play", { name: String(songName || "") });
  }

  // ---------------------------------------------------------------- layout
  stackOffset() {
    const top = Number(this.settings.topOffset) || 12;
    if (this.settings.fullHeight) return top;
    const height = Number(this.settings.height) || 330;
    return this.settings.visible ? top + height + 12 : top;
  }

  applyStackVar() {
    try {
      const root = document.documentElement;
      if (this.settings.visible) root.style.setProperty("--jcode-sidechat-top", this.stackOffset() + "px");
      else root.style.removeProperty("--jcode-sidechat-top");
    } catch {}
  }

  // SideChat and SpotifyPanel share the right column: publish a hide() and call
  // the other panel's hide() whenever this one becomes visible.
  registerPanel() {
    try {
      window.__panelRegistry = window.__panelRegistry || {};
      window.__panelRegistry.spotify = { hide: () => this.hidePanel() };
    } catch {}
  }

  unregisterPanel() {
    try {
      if (window.__panelRegistry) delete window.__panelRegistry.spotify;
    } catch {}
  }

  hidePanel() {
    if (!this.settings.visible) return;
    this.settings.visible = false;
    this.save();
    this.applyStackVar();
    try {
      document.querySelectorAll("#spotifypanel-panel").forEach((el) => el.classList.add("sp-hidden"));
    } catch {}
    this._bump?.();
  }

  hideOtherPanels() {
    try {
      const reg = window.__panelRegistry || {};
      for (const key of Object.keys(reg)) {
        if (key === "spotify") continue;
        try { reg[key]?.hide?.(); } catch {}
      }
    } catch {}
  }

  togglePanel() {
    this.settings.visible = !this.settings.visible;
    if (this.settings.visible) this.hideOtherPanels();
    this.save();
    this.applyStackVar();
    try {
      document.querySelectorAll("#spotifypanel-panel").forEach((el) => {
        el.classList.toggle("sp-hidden", !this.settings.visible);
      });
    } catch {}
    this._bump?.();
  }

  // ---------------------------------------------------------------- hotkey
  startHotkey() {
    this.stopHotkey();
    this._hotAbort = new AbortController();
    const signal = this._hotAbort.signal;
    document.addEventListener("keydown", (e) => {
      if (e.repeat || typeof e.key !== "string") return;
      this._hotKeys.add(e.key.toLowerCase());
      this._checkHotkey();
    }, { capture: true, passive: true, signal });
    document.addEventListener("keyup", (e) => {
      if (typeof e.key === "string") this._hotKeys.delete(e.key.toLowerCase());
      this._hotFired = false;
    }, { capture: true, passive: true, signal });
    window.addEventListener("blur", () => {
      this._hotKeys.clear();
      this._hotFired = false;
    }, { signal });
  }

  stopHotkey() {
    if (this._hotAbort) this._hotAbort.abort();
    this._hotAbort = null;
    this._hotKeys = new Set();
    this._hotFired = false;
  }

  _checkHotkey() {
    if (this._hotFired) return;
    const combo = (this.settings.hotkey || []).map((k) => String(k).toLowerCase());
    if (!combo.length || this._hotKeys.size !== combo.length) return;
    if (!combo.every((k) => this._hotKeys.has(k))) return;
    this._hotFired = true;
    this.togglePanel();
  }

  // ---------------------------------------------------------------- mount
  mount() {
    try { document.querySelectorAll("#spotifypanel-root").forEach((el) => el.remove()); } catch {}
    const RD = BdApi.ReactDOM || (() => {
      try { return BdApi.Webpack.getByKeys?.("createRoot") || null; } catch { return null; }
    })();

    this._rootEl = document.createElement("div");
    this._rootEl.id = "spotifypanel-root";
    document.body.appendChild(this._rootEl);

    const element = h(Boundary, { plugin: this }, h(App, { plugin: this }));
    if (RD?.createRoot) {
      this._reactRoot = RD.createRoot(this._rootEl);
      this._reactRoot.render(element);
    } else if (RD?.render) {
      RD.render(element, this._rootEl);
    } else {
      this.log("ReactDOM unavailable; panel not mounted");
    }
    this.applyStackVar();
  }

  unmount() {
    try { this._reactRoot?.unmount(); } catch {}
    this._reactRoot = null;
    try { this._rootEl?.remove(); } catch {}
    this._rootEl = null;
    try { document.documentElement.style.removeProperty("--jcode-sidechat-top"); } catch {}
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this.registerPanel();
    BdApi.DOM.addStyle("SpotifyPanel-css", CSS);
    this.startHotkey();
    if (this.settings.visible) this.hideOtherPanels();
    this.refreshToken().catch((e) => this.log("initial refresh: " + (e?.message || e)));
    this.mount();
    this.log(`started; visible=${this.settings.visible}; hotkey=${(this.settings.hotkey || []).join("+")}`);
  }

  stop() {
    this.unregisterPanel();
    try { BdApi.DOM.removeStyle("SpotifyPanel-css"); } catch {}
    this.stopHotkey();
    this.unmount();
    this.accessToken = null;
    this.expiresAt = 0;
    this.log("stopped");
  }

  getSettingsPanel() {
    return this.bd.UI.buildSettingsPanel({
      settings: [
        {
          type: "textbox",
          id: "clientId",
          name: "Spotify Client ID",
          note:
            "Create a free app at " + DASHBOARD_URL + " (Apps > Create app), add the Redirect URI " +
            REDIRECT_URI + " in the app settings, then paste its Client ID here. " +
            "Open the panel's own Settings screen (kebab > Panel settings) for a one-click Connect button.",
          value: this.settings.clientId,
        },
        {
          type: "textbox",
          id: "refreshToken",
          name: "Spotify refresh token",
          note:
            "Filled in automatically by Connect Spotify. You can also paste one from docs/tools/spotify-auth.ps1. " +
            "Stored locally in the plugin config.",
          value: this.settings.refreshToken,
        },
        {
          type: "textbox",
          id: "musicChannelId",
          name: "Music channel ID",
          note: "Channel the green send button posts to. Use Developer Mode > Copy Channel ID; enable Message Content intent or make sure the bot can read the channel.",
          value: this.settings.musicChannelId,
        },
        {
          type: "dropdown",
          id: "musicBotId",
          name: "Discord music bot",
          note: "Prefix-command bot. Muse/MEE6/Green-bot are slash-only and cannot be sent by this panel.",
          value: MUSIC_BOTS.some((b) => b.id === this.settings.musicBotId) ? this.settings.musicBotId : MUSIC_BOTS[0].id,
          options: MUSIC_BOTS.map((b) => ({ label: b.label, value: b.id })),
        },
        {
          type: "textbox",
          id: "musicBotPrefix",
          name: "Bot command prefix",
          note: "Blank uses the preset (Jockie is m!). Include a trailing space for mention prefixes such as @Bot ",
          value: this.settings.musicBotPrefix,
        },
        {
          type: "textbox",
          id: "musicBotCommands",
          name: "Command overrides (JSON)",
          note: 'Optional per-action overrides, e.g. {"skip":"{prefix}s","repeat":"{prefix}loop"}. Actions: play, pause, resume, skip, previous, repeat, shuffle, queue, nowPlaying, stop.',
          value: JSON.stringify(this.settings.musicBotCommands || {}),
        },
        {
          type: "number",
          id: "height",
          name: "Panel height (px)",
          value: this.settings.height,
        },
        {
          type: "textbox",
          id: "hotkey",
          name: "Hotkey",
          note: "Comma separated, e.g. Alt,m",
          value: (this.settings.hotkey || []).join(","),
        },
      ],
      onChange: (category, id, value) => {
        if (id === "hotkey") this.settings.hotkey = String(value).split(",").map((s) => s.trim()).filter(Boolean);
        else if (id === "height") this.settings.height = Math.max(150, Math.min(420, Number(value) || 210));
        else if (id === "musicBotCommands") {
          const raw = String(value || "").trim();
          if (!raw) {
            this.settings.musicBotCommands = {};
          } else {
            try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                this.settings.musicBotCommands = parsed;
              }
            } catch {}
          }
        } else if (id === "musicBotId") {
          this.settings.musicBotId = String(value || "jockie");
          this.settings.musicBotPrefix = "";
          this.settings.musicBotCommands = {};
        } else this.settings[id] = value;
        if (id === "clientId") {
          this.accessToken = null;
          this.expiresAt = 0;
        }
        this.save();
        this.applyStackVar();
        if (id === "refreshToken") this.refreshToken(true).catch(() => {});
        this._bump?.();
      },
    });
  }
}

// -------------------------------------------------------------------- React

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    try { this.props.plugin?.log("render error: " + (error?.message || error)); } catch {}
  }
  render() {
    if (this.state.error) {
      return h("div", { id: "spotifypanel-panel", style: { display: "flex", flexDirection: "column" } },
        h("div", { className: "sp-empty" },
          "SpotifyPanel render error: " + (this.state.error.message || String(this.state.error))));
    }
    return this.props.children;
  }
}

// Material Design (Apache-2.0) 24x24 solid glyphs. Solid paths read far better at
// small sizes than stroked line icons and no longer need stroke settings.
const ICONS = {
  shuffle: "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
  prev: "M6 6h2v12H6zm3.5 6 8.5 6V6l-8.5 6z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  external: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  back: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z",
  search: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  heartOutline: "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  volume: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  queue: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 1 0 3 3V8h3V6h-5z",
  chevronUp: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  dotsVertical: "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  star: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  download: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7l5-5 5 5z",
  send: "M2.01 21 23 12 2.01 3 2 10l15 2-15 2z",
};

const TAB_LABELS = {
  playlists: "Playlists",
  songs: "Songs",
  recent: "Recent",
};

// Bottom navigation: four destinations covering the six library tabs.
const NAV_ITEMS = [
  { id: "home", label: "Home", glyph: "list", tabs: ["playlists"] },
  { id: "library", label: "Library", glyph: "heart", tabs: ["songs"] },
];

const navOfTab = (name) =>
  name === "playlists" ? "home"
    : name === "albums" || name === "artists" ? "browser"
      : name === "search" ? "search"
        : "library";

function icon(name, size) {
  const px = size || 16;
  return h(
    "svg",
    {
      className: "sp-icon",
      viewBox: "0 0 24 24",
      width: px,
      height: px,
      fill: "currentColor",
      stroke: "none",
      "aria-hidden": "true",
      focusable: "false",
    },
    h("path", { d: ICONS[name] })
  );
}

const fmtTime = (ms) => {
  try {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  } catch { return "0:00"; }
};

function App({ plugin }) {
  const [, force] = useReducer((x) => x + 1, 0);
  const [player, setPlayer] = useState(undefined);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("browse");
  const [tab, setTab] = useState("playlists");
  const [lists, setLists] = useState({});
  const [tabError, setTabError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [queueData, setQueueData] = useState(null);
  const [volume, setVolume] = useState(typeof plugin.settings.volume === "number" ? plugin.settings.volume : 60);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [channelDraft, setChannelDraft] = useState(String(plugin.settings.musicChannelId || ""));
  const [botMenuOpen, setBotMenuOpen] = useState(false);
  const [botNotice, setBotNotice] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [customCommand, setCustomCommand] = useState("");
  const [showCustomCommand, setShowCustomCommand] = useState(false);
  const [apiDraft, setApiDraft] = useState(String(plugin.settings.clientId || ""));
  const [tokenDraft, setTokenDraft] = useState(String(plugin.settings.refreshToken || ""));
  const [connecting, setConnecting] = useState(false);
  const [authStage, setAuthStage] = useState("idle");
  const [authUrl, setAuthUrl] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  const [hiddenTracks, setHiddenTracks] = useState(() => new Set());
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [openList, setOpenList] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [, setTick] = useState(0);
  const [seekDraft, setSeekDraft] = useState(null);
  const seekTimer = useRef(0);
  const seekHold = useRef(0);
  const fetchedAt = useRef(0);

  useEffect(() => {
    plugin._bump = force;
    return () => { if (plugin._bump === force) plugin._bump = null; };
  }, []);

  // Reflect the device's real volume once, instead of assuming the saved value.
  const volSynced = useRef(false);
  useEffect(() => {
    if (volSynced.current) return;
    const deviceVolume = player && player.device && player.device.volume_percent;
    if (typeof deviceVolume !== "number") return;
    volSynced.current = true;
    setVolume(deviceVolume);
    plugin.settings.volume = deviceVolume;
  }, [player]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!plugin.settings.refreshToken) { setError("not connected"); setPlayer(undefined); return; }
      try {
        const p = await plugin.getPlayer();
        if (!alive) return;
        fetchedAt.current = Date.now();
        setPlayer(p || null);
        setError(null);
        if (!p || !p.device) {
          const ds = await plugin.getDevices().catch(() => []);
          if (alive) setDevices(ds);
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.status === 403 ? "premium required for control" : (e?.message || "error"));
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!botMenuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setBotMenuOpen(false);
        setShowCustomCommand(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [botMenuOpen]);

  const loadingRef = useRef({});
  const loadTab = (name) => {
    if (name === "search" || loadingRef.current[name]) return;
    loadingRef.current[name] = true;
    setLists((l) => ({ ...l, [name]: "loading" }));
    const loaders = {
      playlists: () => plugin.getPlaylists(),
      songs: () => plugin.getSavedTracks(),
      albums: () => plugin.getSavedAlbums(),
      artists: () => plugin.getFollowedArtists(),
      recent: () => plugin.getRecent(),
    };
    (loaders[name] ? loaders[name]() : Promise.resolve([]))
      .then((rows) => setLists((l) => ({ ...l, [name]: Array.isArray(rows) ? rows : [] })))
      .catch((e) => {
        setLists((l) => ({ ...l, [name]: [] }));
        setTabError(e?.status === 403
          ? "needs library scope - reconnect Spotify in panel settings"
          : (e?.message || "failed to load"));
      })
      .finally(() => { loadingRef.current[name] = false; });
  };

  useEffect(() => {
    if (view !== "browse") return;
    if (tab === "search") return;
    if (["songs", "albums", "artists", "recent"].includes(tab) && plugin.needsLibraryScopes()) {
      setTabError("needs library scope - reconnect Spotify in panel settings");
      return;
    }
    loadTab(tab);
  }, [view, tab]);

  useEffect(() => {
    if (view !== "queue") return;
    let alive = true;
    plugin.getQueue()
      .then((q) => { if (alive) setQueueData(q); })
      .catch(() => { if (alive) setQueueData({ current: null, upcoming: [] }); });
    return () => { alive = false; };
  }, [view]);

  useEffect(() => {
    const id = (player && player.item && player.item.id) || null;
    if (!id) { setSaved(false); return; }
    let alive = true;
    plugin.isTrackSaved(id).then((v) => { if (alive) setSaved(!!v); }).catch(() => {});
    return () => { alive = false; };
  }, [(player && player.item && player.item.id) || null]);

  const track = player?.item || null;
  const cover = track?.album?.images?.length ? track.album.images[0].url : null;
  const duration = Math.max(0, track?.duration_ms || 0);
  const base = Math.max(0, player?.progress_ms || 0);
  const elapsed = player?.is_playing ? Math.max(0, Date.now() - fetchedAt.current) : 0;
  const position = duration ? Math.min(duration, base + elapsed) : base + elapsed;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;
  const deviceName = player?.device?.name || null;
  const panelHeight = Number(plugin.settings.height) || 330;
  const viewportH = (typeof window !== "undefined" && window.innerHeight) ? window.innerHeight : (panelHeight + 24);
  const viewportW = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : 1280;
  const panelW = Math.min(Number(plugin.settings.width) || 420, viewportW - 24);
  // full-bleed artwork: the art is the panel width, so only the height budget
  // matters. chromeH covers meta, progress, transport and the device row.
  const chromeH = 392;
  const panelBoxH = plugin.settings.fullHeight ? viewportH - 24 : panelHeight;
  const availableH = panelBoxH - chromeH;
  const artSize = Math.max(96, Math.min(Math.round(panelW - 48), availableH));

  const volTimer = useRef(0);
  const changeVolume = (v) => {
    const next = Math.max(0, Math.min(100, Math.round(v)));
    setVolume(next);
    clearTimeout(volTimer.current);
    volTimer.current = setTimeout(() => {
      plugin.settings.volume = next;
      plugin.save();
      try {
        Promise.resolve(plugin.setVolume(next)).then((res) => {
          if (res && res.ok === false) setError(res.error || "volume failed");
        }).catch(() => {});
      } catch (e) {
        setError(e?.message || "volume failed");
      }
    }, 180);
  };

  // Drag the scrubber: show the thumb immediately, send one seek after the
  // drag settles, and hold the drawn position until the next poll catches up.
  const changeSeek = (v) => {
    const next = Math.max(0, Math.min(100, Number(v) || 0));
    setSeekDraft(next);
    seekHold.current = Date.now() + 1400;
    clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      if (!duration) return;
      run(() => plugin.seek(duration * next / 100), (p) => ({ ...p, progress_ms: duration * next / 100 }));
    }, 180);
  };

  const run = async (fn, optimistic) => {
    if (busy) return;
    setBusy(true);
    if (optimistic && player) setPlayer(optimistic(player));
    const res = await fn();
    if (!res.ok) {
      setError(res.error || "failed");
      setPlayer((p) => (p ? { ...p } : p));
    } else {
      setError(null);
      setTimeout(async () => {
        try {
          const p = await plugin.getPlayer();
          fetchedAt.current = Date.now();
          setPlayer(p || null);
        } catch {}
      }, 350);
    }
    setBusy(false);
  };

  const openContainer = async (kind, item) => {
    pushHistory();
    setListLoading(true);
    const base = { kind, id: item.id, name: item.name, uri: item.uri, image: imgOf(item), tracks: null };
    setOpenList(base);
    let tracks = [];
    try {
      tracks = kind === "album"
        ? await plugin.getAlbumTracks(item.id)
        : kind === "artist"
          ? await plugin.getArtistTopTracks(item.id)
          : await plugin.getPlaylistTracks(item.id);
    } catch {}
    setOpenList({ ...base, tracks: tracks || [] });
    setListLoading(false);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setSearching(true);
    try {
      const found = await plugin.searchTracks(q);
      setResults(found);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const playUri = async (uri, context, list, index) => {
    const res = context
      ? await plugin.playContext(uri)
      : Array.isArray(list) && list.length > 1
        ? await plugin.playTracks(list, index || 0)
        : await plugin.playTrack(uri);
    if (!res.ok) { setError(res.error || "play failed"); return; }
    setError(null);
    pushHistory();
    setView("now");
    setTimeout(async () => {
      try {
        const playerState = await plugin.getPlayer();
        fetchedAt.current = Date.now();
        setPlayer(playerState || null);
      } catch {}
    }, 500);
  };

  const row = (key, image, name, sub, onPick, onQueue) =>
    h("div", { className: "sp-row", key, onClick: onPick, title: name },
      image ? h("img", { className: "sp-row-art", src: image, alt: "" }) : h("div", { className: "sp-row-art" }),
      h("div", { className: "sp-row-main" },
        h("div", { className: "sp-row-name" }, name),
        sub ? h("div", { className: "sp-row-sub" }, sub) : null),
      onQueue
        ? h("button", {
            className: "sp-row-add",
            title: "Add to queue",
            onClick: (e) => { e.stopPropagation(); onQueue(); },
          }, icon("plus", 15))
        : null,
      h("span", { className: "sp-row-play" }, "PLAY"));

  const imgOf = (o) => (o && o.images && o.images.length ? o.images[o.images.length - 1].url : null);
  const artistsOf = (t) => (t && t.artists ? t.artists.map((a) => a.name).join(", ") : "");

  const addQueue = async (uri) => {
    const res = await plugin.addToQueue(uri);
    if (!res.ok) setError(res.error || "queue failed");
  };

  const toggleSave = async () => {
    if (!track?.id) return;
    if (plugin.needsLibraryScopes()) {
      setError("library scope missing - reconnect Spotify in panel settings");
      return;
    }
    const next = !saved;
    setSaved(next);
    const res = await plugin.saveTrack(track.id, next);
    if (!res.ok) { setSaved(!next); setError(res.error || "save failed"); }
  };

  const flashNotice = (text, ms = 4000) => {
    setNotice(text);
    setTimeout(() => setNotice(""), ms);
  };

  const copyRedirect = async () => {
    const ok = await copyText(REDIRECT_URI);
    flashNotice(ok ? "redirect URI copied" : "could not copy - select it manually", 3000);
  };

  const connectSpotify = async () => {
    const id = apiDraft.trim();
    if (!id) { flashNotice("paste your Spotify Client ID first"); return; }
    setError(null);

    if (!plugin.hasLoopback()) {
      const started = await plugin.beginAuth(id);
      if (!started.ok) { flashNotice("connect failed: " + started.error, 8000); return; }
      setAuthUrl(started.url);
      setAuthStage("paste");
      setPastedUrl("");
      openExternal(started.url);
      flashNotice("approve in the browser, then paste the redirected URL below", 9000);
      return;
    }

    setConnecting(true);
    setNotice("");
    const res = await plugin.connectSpotify(id);
    setConnecting(false);
    if (!res.ok && /node http|port 8899|EADDRINUSE/i.test(res.error || "")) {
      const started = await plugin.beginAuth(id);
      if (!started.ok) { flashNotice("connect failed: " + started.error, 8000); return; }
      setAuthUrl(started.url);
      setAuthStage("paste");
      setPastedUrl("");
      openExternal(started.url);
      flashNotice("approve in the browser, then paste the redirected URL below", 9000);
      return;
    }
    if (!res.ok) { flashNotice("connect failed: " + res.error, 8000); return; }
    setTokenDraft(plugin.settings.refreshToken || "");
    setNotice("spotify connected");
    setTimeout(() => setNotice(""), 4000);
    setView("now");
    try {
      const p = await plugin.getPlayer();
      fetchedAt.current = Date.now();
      setPlayer(p || null);
      setError(null);
    } catch (e) {
      setError(e?.message || "could not read playback");
    }
  };

  const finishSpotifyAuth = async () => {
    if (!pastedUrl.trim()) { flashNotice("paste the redirected URL first"); return; }
    setConnecting(true);
    const res = await plugin.completeAuth(pastedUrl);
    setConnecting(false);
    if (!res.ok) { flashNotice("connect failed: " + res.error, 8000); return; }
    setAuthStage("idle");
    setPastedUrl("");
    setTokenDraft(plugin.settings.refreshToken || "");
    flashNotice("spotify connected");
    setError(null);
    setView("now");
    plugin._bump?.();
    try {
      const p = await plugin.getPlayer();
      fetchedAt.current = Date.now();
      setPlayer(p || null);
    } catch (e) {
      setError(e?.message || "could not read playback");
    }
  };

  const saveSpotifyToken = async () => {
    const id = apiDraft.trim();
    const token = tokenDraft.trim();
    if (!id) { flashNotice("client ID is required"); return; }
    if (!token) { flashNotice("paste a refresh token or use Connect Spotify"); return; }
    plugin.settings.clientId = id;
    plugin.settings.refreshToken = token;
    plugin.accessToken = null;
    plugin.expiresAt = 0;
    plugin.save();
    try {
      await plugin.refreshToken(true);
      flashNotice("token saved and works");
      setError(null);
      setView("now");
      plugin._bump?.();
    } catch (e) {
      flashNotice("token rejected: " + (e?.message || "failed"), 7000);
    }
  };

  const disconnectSpotify = () => {
    plugin.disconnectSpotify();
    setTokenDraft("");
    setPlayer(null);
    setError("not connected");
    setAuthStage("idle");
    setPastedUrl("");
    setAuthUrl("");
    flashNotice("spotify disconnected", 3000);
    plugin._bump?.();
  };

  const chooseBot = (id) => {
    plugin.settings.musicBotId = id;
    plugin.settings.musicBotPrefix = "";
    plugin.settings.musicBotCommands = {};
    plugin.save();
    plugin._bump?.();
  };

  const changeBotPrefix = (value) => {
    plugin.settings.musicBotPrefix = value;
    plugin.save();
    plugin._bump?.();
  };

  const changeBotTemplate = (action, value) => {
    const current = plugin.settings.musicBotCommands;
    const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
    plugin.settings.musicBotCommands = { ...base, [action]: value };
    plugin.save();
    plugin._bump?.();
  };

  const resetBotTemplates = () => {
    plugin.settings.musicBotCommands = {};
    plugin.save();
    plugin._bump?.();
  };

  const sendBotCommand = async (action) => {
    const res = await plugin.sendMusicCommand(action, track);
    const text = res.ok ? "sent " + res.content : (res.error || "send failed");
    setBotNotice({ ok: !!res.ok, text });
    flashNotice(text, res.ok ? 3000 : 5000);
  };

  const sendBotRaw = async () => {
    const res = await plugin.sendRawMusicCommand(customCommand);
    if (!res.ok) {
      setBotNotice({ ok: false, text: res.error || "send failed" });
      flashNotice(res.error || "send failed", 5000);
      return;
    }
    flashNotice("sent " + res.content, 3000);
    setCustomCommand("");
    setShowCustomCommand(false);
    setBotMenuOpen(false);
  };

  const listBody = (name) => {
    const rows = lists[name];
    if (rows === undefined && ["songs", "albums", "artists", "recent"].includes(name) && plugin.needsLibraryScopes()) {
      return h("div", { className: "sp-browse-empty" }, "Reconnect Spotify in panel settings to add library access");
    }
    if (rows === undefined || rows === "loading") return h("div", { className: "sp-browse-empty" }, "Loading...");
    if (!rows.length) return h("div", { className: "sp-browse-empty" }, tabError || "Nothing here yet");
    if (name === "songs" || name === "recent") {
      const uris = rows.map((t) => t.uri);
      return rows.map((t, i) => row(t.id, imgOf(t.album), t.name, artistsOf(t),
        () => playUri(t.uri, false, uris, i), () => addQueue(t.uri)));
    }
    if (name === "albums") {
      return rows.map((a) => row(a.id, imgOf(a), a.name, artistsOf(a), () => openContainer("album", a)));
    }
    if (name === "artists") {
      return rows.map((a) => row(a.id, imgOf(a), a.name, (a.genres && a.genres[0]) || "artist",
        () => openContainer("artist", a)));
    }
    return rows.map((pl) => row(pl.id, imgOf(pl), pl.name, (pl.tracks?.total || 0) + " tracks",
      () => openContainer("playlist", pl)));
  };

  const historyRef = useRef([]);
  const pushHistory = () => { historyRef.current.push({ view, tab, openList }); };
  const goBack = () => {
    const stack = historyRef.current;
    if (!stack.length) return false;
    const prev = stack.pop();
    setView(prev.view || "now");
    setTab(prev.tab || "playlists");
    setOpenList(prev.openList || null);
    return true;
  };

  const botProfile = plugin.musicBotProfile();
  const botActions = plugin.musicBotActionList();
  const configuredBotId = String(plugin.settings.musicBotId || "jockie");
  const activeBotId = MUSIC_BOTS.some((b) => b.id === configuredBotId) ? configuredBotId : MUSIC_BOTS[0].id;
  const botOverrides = (plugin.settings.musicBotCommands && typeof plugin.settings.musicBotCommands === "object" && !Array.isArray(plugin.settings.musicBotCommands))
    ? plugin.settings.musicBotCommands
    : {};
  const previewTrack = track || { name: "<track>", artists: [{ name: "<artist>" }] };
  const playPreview = plugin.formatMusicCommand("play", previewTrack) || "(no play command configured)";

  // The Now Playing player. Library views keep the compact bottom bar.
  const seekPct = seekDraft != null && Date.now() < seekHold.current ? seekDraft : pct;
  const renderPlayer = () => {
    return h("div", { className: "sp-player" },
      cover
        ? h("img", { className: "sp-art sp-cover", src: cover, alt: "", style: { width: artSize + "px", height: artSize + "px" } })
        : h("div", { className: "sp-art sp-cover sp-cover-empty", style: { width: artSize + "px", height: artSize + "px" } }),
      h(
        "div",
        { className: "sp-info" },
        h("button", {
          className: "sp-btn" + (player?.shuffle_state ? " sp-active" : ""),
          title: "Shuffle",
          onClick: () => run(() => plugin.setShuffle(!player?.shuffle_state)),
        }, icon("shuffle", 20)),
        h(
          "div",
          { className: "sp-meta" },
          h("div", { className: "sp-track", title: track?.name || "" }, track ? track.name : "nothing playing"),
          h("div", { className: "sp-artist" }, track ? artistsOf(track) : "open Spotify on a device")
        ),
        h("button", {
          className: "sp-btn" + (player?.repeat_state && player.repeat_state !== "off" ? " sp-active" : ""),
          title: player?.repeat_state === "track" ? "Repeat one" : "Repeat",
          onClick: () => {
            const order = { off: "context", context: "track", track: "off" };
            const nextState = order[player?.repeat_state || "off"] || "off";
            run(() => plugin.setRepeat(nextState), (p) => ({ ...p, repeat_state: nextState }));
          },
        }, icon("repeat", 20))
      ),
      h(
        "div",
        { className: "sp-progress-row" },
        h("span", { className: "sp-time" }, fmtTime(position)),
        h("input", {
          className: "sp-seek",
          type: "range",
          min: "0",
          max: "100",
          step: "0.1",
          value: String(Math.max(0, Math.min(100, seekPct))),
          style: { backgroundSize: Math.max(0, Math.min(100, seekPct)) + "% 3px, 100% 3px" },
          title: "Seek",
          onChange: (e) => changeSeek(Number(e.target.value)),
        }),
        h("span", { className: "sp-time" }, fmtTime(duration))
      ),
      h(
        "div",
        { className: "sp-controls" },
        h("button", {
          className: "sp-btn sp-like" + (saved ? " sp-like-on" : ""),
          title: saved ? "Remove from Liked Songs" : "Save to Liked Songs",
          onClick: toggleSave,
        }, icon("heart", 22)),
        h("button", { className: "sp-btn sp-main-btn", title: "Previous", onClick: () => run(() => plugin.previous()) },
          icon("prev", 24)),
        h("button", {
          className: "sp-play-circle",
          title: player?.is_playing ? "Pause" : "Play",
          onClick: () => run(
            () => (player?.is_playing ? plugin.pause() : plugin.play()),
            (p) => ({ ...p, is_playing: !p.is_playing })
          ),
        }, player?.is_playing
          ? icon("pause", 24)
          : h("span", { className: "sp-tri" }, icon("play", 24))),
        h("button", { className: "sp-btn sp-main-btn", title: "Next", onClick: () => run(() => plugin.next()) },
          icon("next", 24)),
        h("button", {
          className: "sp-btn sp-send",
          title: "Send " + botProfile.label + " play \u00b7 right-click for more",
          onClick: async () => {
            if (!track) { flashNotice("nothing playing", 3000); return; }
            await sendBotCommand("play");
          },
          onContextMenu: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(false);
            setShowCustomCommand(false);
            setBotNotice(null);
            setBotMenuOpen(true);
          },
        }, icon("send", 22))
      ),
      h("div", { className: "sp-volume-row" },
        h("button", {
          className: "sp-btn",
          title: volume > 0 ? "Mute" : "Unmute",
          onClick: () => changeVolume(volume > 0 ? 0 : 60),
        }, icon("volume", 18)),
        h("input", {
          className: "sp-vol-range",
          type: "range",
          min: "0",
          max: "100",
          step: "1",
          value: String(volume),
          title: "Volume " + volume + "%",
          style: { backgroundSize: volume + "% 2px, 100% 2px" },
          onChange: (e) => changeVolume(Number(e.target.value)),
        }),
        h("span", { className: "sp-vol-pct" }, volume + "%")),
      notice ? h("div", { className: "sp-notice" }, notice) : null
    );
  };
  // Compact bottom bar for the library, queue, connect and settings views.
  // Play toggles playback, the bar opens Now Playing, the chevron opens the
  // library grid at Playlists.
  const miniBar = h("div", {
    className: "sp-mini",
    role: "button",
    title: "Open Now Playing",
    onClick: () => { pushHistory(); setView("now"); },
  },
    h("button", {
      className: "sp-mini-play",
      title: player?.is_playing ? "Pause" : "Play",
      onClick: (e) => {
        e.stopPropagation();
        run(
          () => (player?.is_playing ? plugin.pause() : plugin.play()),
          (p) => ({ ...p, is_playing: !p.is_playing })
        );
      },
    }, icon(player?.is_playing ? "pause" : "play", 16)),
    h("div", { className: "sp-mini-text" },
      h("strong", null, track ? artistsOf(track) : "nothing playing"),
      h("span", { className: "sp-mini-sep" }, " \u2013 "),
      h("span", { className: "sp-mini-song" }, track ? track.name : "")),
    h("button", {
      className: "sp-mini-chev",
      title: "Open your library",
      onClick: (e) => {
        e.stopPropagation();
        pushHistory();
        setTab("playlists");
        setOpenList(null);
        setView("browse");
      },
    }, icon("chevronUp", 18))
  );

  const queueUris = queueData
    ? [queueData.current?.uri, ...(queueData.upcoming || []).map((t) => t.uri)].filter(Boolean)
    : [];
  const queueOffset = queueData && queueData.current ? 1 : 0;
  const queueNode = h(
    "div",
    { className: "sp-browse" },
    h("div", { className: "sp-tabs" },
      h("button", { className: "sp-tab sp-tab-active" }, "Queue"),
      h("button", {
        className: "sp-tab",
        onClick: async () => { setQueueData(null); try { setQueueData(await plugin.getQueue()); } catch { setQueueData({ current: null, upcoming: [] }); } },
      }, "Refresh")
    ),
    h("div", { className: "sp-scroll" },
      queueData === null
        ? h("div", { className: "sp-browse-empty" }, "Loading queue...")
        : [
            h("div", { className: "sp-queue-label", key: "now" }, "now playing"),
            queueData.current
              ? row("q-now", imgOf(queueData.current.album), queueData.current.name, artistsOf(queueData.current),
                  () => playUri(queueData.current.uri, false, queueUris, 0))
              : h("div", { className: "sp-browse-empty", key: "q-none" }, "nothing playing"),
            h("div", { className: "sp-queue-label", key: "next" }, "up next"),
            queueData.upcoming.length
              ? queueData.upcoming.slice(0, 30).map((t, i) => row(
                  (t.id || "q") + i, imgOf(t.album), t.name, artistsOf(t),
                  () => playUri(t.uri, false, queueUris, queueOffset + i), () => addQueue(t.uri)))
              : h("div", { className: "sp-browse-empty", key: "q-empty" }, "queue is empty")
          ]
    ),
    miniBar
  );

  const browseNode = h(
    "div",
    { className: "sp-browse" },
    h("div", { className: "sp-search-row" },
      h("input", {
        className: "sp-search-input",
        placeholder: "Search songs",
        value: query,
        onChange: (e) => { setQuery(e.target.value); if (!e.target.value) setResults(null); },
        onKeyDown: (e) => { if (e.key === "Enter") runSearch(); },
      })
    ),
    results !== null
      ? null
      : h("div", { className: "sp-tabs" },
          Object.keys(TAB_LABELS).map((name) =>
            h("button", {
              key: name,
              className: "sp-tab" + (tab === name ? " sp-tab-active" : ""),
              onClick: () => {
                pushHistory();
                setResults(null);
                setTabError(null);
                setOpenList(null);
                setTab(name);
                loadTab(name);
              },
            }, TAB_LABELS[name]))
        ),
    results !== null
      ? h("div", { className: "sp-scroll" },
          results.length
            ? (() => {
                const uris = results.map((t) => t.uri);
                return results.map((t, i) => row(t.id, t.album?.images?.[t.album.images.length - 1]?.url,
                  t.name, artistsOf(t),
                  () => playUri(t.uri, false, uris, i), () => addQueue(t.uri)));
              })()
            : h("div", { className: "sp-browse-empty" }, "No matches"))
      : openList
        ? h("div", { className: "sp-scroll", key: "detail-" + openList.id },
            h("div", { className: "sp-row", onClick: () => setOpenList(null) },
              h("div", { className: "sp-row-main" },
                h("div", { className: "sp-row-name" }, "\u2039 " + openList.name)),
              h("span", { className: "sp-row-play" }, "BACK")),
            openList.uri
              ? h("div", { className: "sp-detail-playrow" },
                  h("button", {
                    className: "sp-detail-playtext",
                    onClick: () => playUri(openList.uri, true),
                  }, "Play on this device"))
              : null,
            listLoading
              ? h("div", { className: "sp-browse-empty" }, "Loading tracks...")
              : (openList.tracks && openList.tracks.length)
                ? (() => {
                    const uris = openList.tracks.map((t) => t.uri);
                    return openList.tracks.map((t, i) => row(t.id, t.album?.images?.[t.album.images.length - 1]?.url,
                      t.name, artistsOf(t),
                      () => playUri(t.uri, false, uris, i), () => addQueue(t.uri)));
                  })()
                : h("div", { className: "sp-browse-empty" }, "No tracks"))
        : h("div", { className: "sp-scroll", key: "list-" + tab }, listBody(tab)),
    miniBar
  );

  const connectNode = h("div", { className: "sp-setup" },
    h("div", { className: "sp-setup-title" }, "Connect Spotify"),
    h("div", { className: "sp-setup-step" },
      "The panel uses your own free Spotify app, so installs do not share a quota. One-time setup, about two minutes."),
    h("div", { className: "sp-setup-step" },
      h("strong", null, "1. "), "Create an app in the ",
      h("button", {
        className: "sp-link",
        title: DASHBOARD_URL,
        onClick: () => openExternal(DASHBOARD_URL),
      }, "Spotify Developer Dashboard"),
      h("span", { className: "sp-field-hint" }, " (developer.spotify.com/dashboard)"),
      "."),
    h("div", { className: "sp-setup-step" },
      h("strong", null, "2. "), "Open the app's Settings and add this Redirect URI exactly:"),
    h("div", { className: "sp-code-row" },
      h("code", { className: "sp-code" }, REDIRECT_URI),
      h("button", { className: "sp-link", onClick: copyRedirect }, "Copy")),
    h("div", { className: "sp-setup-step" },
      h("strong", null, "3. "), "Copy the app's Client ID, then press Connect in the panel settings."),
    h("button", {
      className: "sp-primary-btn",
      onClick: () => setView("settings"),
    }, "Open connection settings"),
    h("button", {
      className: "sp-textbtn",
      onClick: () => setView("settings"),
    }, "I already have a refresh token"),
    notice ? h("div", { className: "sp-notice" }, notice) : null,
    miniBar
  );

  const settingsNode = h("div", { className: "sp-browse sp-settings" },
    h("div", { className: "sp-browse-head" },
      h("span", { className: "sp-browse-title" }, "Panel settings")
    ),
    h("div", { className: "sp-settings-body" },
      h("div", { className: "sp-settings-heading" }, "Spotify connection"),
      h("div", {
        className: "sp-field-hint " + (plugin.settings.refreshToken ? "sp-status-ok" : "sp-status-bad"),
      }, plugin.settings.refreshToken ? "connected" : "not connected"),
      h("div", { className: "sp-field-hint" },
        "Playback control needs Spotify Premium. This panel only needs the Client ID - never paste a Client Secret."),

      h("div", { className: "sp-field-label" }, "Client ID"),
      h("input", {
        className: "sp-search-input",
        placeholder: "paste your Spotify app's Client ID",
        value: apiDraft,
        onChange: (e) => setApiDraft(e.target.value),
      }),
      h("div", { className: "sp-code-row" },
        h("button", {
          className: "sp-link",
          onClick: () => openExternal(DASHBOARD_URL),
        }, "Create a Spotify app"),
        h("span", { className: "sp-field-hint" }, "Redirect URI:"),
        h("code", { className: "sp-code" }, REDIRECT_URI),
        h("button", { className: "sp-link", onClick: copyRedirect }, "Copy")),

      h("div", { className: "sp-settings-row" },
        h("button", {
          className: "sp-primary-btn",
          disabled: connecting,
          onClick: connectSpotify,
        }, connecting ? "waiting..." : (authStage === "paste" ? "Restart login" : "Connect Spotify")),
        h("button", {
          className: "sp-textbtn",
          onClick: saveSpotifyToken,
        }, "Save token")),

      authStage === "paste"
        ? h("div", { className: "sp-paste-box" },
            h("div", { className: "sp-field-label" }, "Finish login"),
            h("div", { className: "sp-field-hint" },
              "Press Agree in the browser. The page will fail to load (that is expected). " +
              "Copy the full address from the address bar and paste it here."),
            h("input", {
              className: "sp-search-input",
              placeholder: "http://127.0.0.1:8899/callback/?code=...",
              value: pastedUrl,
              onChange: (e) => setPastedUrl(e.target.value),
              onKeyDown: (e) => { if (e.key === "Enter") finishSpotifyAuth(); },
            }),
            h("div", { className: "sp-settings-row" },
              h("button", {
                className: "sp-primary-btn",
                disabled: connecting,
                onClick: finishSpotifyAuth,
              }, connecting ? "checking..." : "Finish connection"),
              h("button", {
                className: "sp-textbtn",
                onClick: () => openExternal(authUrl),
              }, "Open login page again"),
              h("button", {
                className: "sp-textbtn",
                onClick: async () => {
                  const ok = await copyText(authUrl);
                  flashNotice(ok ? "login link copied" : "could not copy the link", 3000);
                },
              }, "Copy login link")))
        : null,

      h("div", { className: "sp-field-label" }, "Refresh token"),
      h("input", {
        className: "sp-search-input",
        placeholder: connecting ? "waiting for the browser..." : "filled in by Connect, or paste one",
        value: tokenDraft,
        onChange: (e) => setTokenDraft(e.target.value),
      }),
      plugin.settings.refreshToken
        ? h("button", { className: "sp-textbtn", onClick: disconnectSpotify }, "Disconnect")
        : null,

      h("div", { className: "sp-settings-sep" }),
      h("div", { className: "sp-settings-heading" }, "Discord music bot"),
      h("div", { className: "sp-field-label" }, "Bot"),
      h("select", {
        className: "sp-select",
        value: activeBotId,
        onChange: (e) => chooseBot(e.target.value),
      }, MUSIC_BOTS.map((b) => h("option", { key: b.id, value: b.id }, b.label))),
      h("div", { className: "sp-field-hint" }, botProfile.note),

      h("div", { className: "sp-field-label" }, "Command prefix"),
      h("input", {
        className: "sp-search-input",
        placeholder: (MUSIC_BOTS.find((b) => b.id === activeBotId) || MUSIC_BOTS[0]).prefix,
        value: plugin.settings.musicBotPrefix || "",
        onChange: (e) => changeBotPrefix(e.target.value),
      }),
      h("div", { className: "sp-field-hint" },
        "Blank uses the preset. Include a trailing space for mention prefixes such as @Bot "),

      h("div", { className: "sp-field-hint sp-status-ok" }, "Sends: " + playPreview),

      h("button", {
        className: "sp-textbtn",
        onClick: () => setShowTemplates(!showTemplates),
      }, showTemplates ? "Hide command templates" : "Edit command templates"),

      showTemplates
        ? h("div", { className: "sp-template-list" },
            h("div", { className: "sp-field-hint" },
              "Tokens: {prefix}, {query} (title + artists), {title}, {artist}, {album}, {url}, {uri}"),
            MUSIC_BOT_ACTIONS.map((action) => {
              const overridden = Object.prototype.hasOwnProperty.call(botOverrides, action.id);
              const value = overridden
                ? String(botOverrides[action.id] == null ? "" : botOverrides[action.id])
                : (botProfile.commands[action.id] || "");
              return h("div", { className: "sp-template-row", key: action.id },
                h("div", { className: "sp-field-label" }, action.label),
                h("input", {
                  className: "sp-search-input",
                  value,
                  placeholder: "empty to hide this action",
                  onChange: (e) => changeBotTemplate(action.id, e.target.value),
                }));
            }),
            h("button", { className: "sp-textbtn", onClick: resetBotTemplates }, "Reset to preset"))
        : null,

      h("div", { className: "sp-settings-sep" }),
      h("div", { className: "sp-settings-heading" }, "Discord channel"),
      h("div", { className: "sp-field-label" }, "Music channel ID"),
      h("input", {
        className: "sp-search-input",
        placeholder: "right-click the channel > Copy Channel ID",
        value: channelDraft,
        onChange: (e) => setChannelDraft(e.target.value),
      }),
      h("div", { className: "sp-settings-row" },
        h("button", {
          className: "sp-textbtn",
          onClick: () => { const id = plugin.currentChannelId(); if (id) setChannelDraft(id); },
        }, "Use current channel"),
        h("button", {
          className: "sp-textbtn",
          onClick: () => {
            plugin.settings.musicChannelId = channelDraft.trim();
            plugin.save();
            flashNotice("music channel saved", 3000);
          },
        }, "Save")
      ),
      h("div", { className: "sp-field-hint" },
        "Commands are sent as you. The bot must be in this channel and accept prefix commands. Slash-only bots cannot be controlled this way."),
      notice ? h("div", { className: "sp-notice" }, notice) : null
    ),
    miniBar
  );

  const statusLine = panelW < 360
    ? (deviceName || (player?.is_playing ? "playing" : "paused"))
    : deviceName
      ? (player?.is_playing ? "playing \u00b7 " : "paused \u00b7 ") + deviceName
      : (error === "not connected" ? "not connected" : "idle");

  // The panel only knows Spotify playback state, not the bot's. Show both
  // pause and resume so the menu never claims the wrong state.
  const menuActions = botActions;

  const botMenuNode = botMenuOpen
    ? [
        h("div", {
          key: "botmenu-backdrop",
          className: "sp-botmenu-backdrop",
          onClick: () => { setBotMenuOpen(false); setShowCustomCommand(false); },
        }),
        h("div", { key: "botmenu", className: "sp-botmenu" },
          h("div", { className: "sp-botmenu-head" },
            h("div", null,
              h("div", { className: "sp-botmenu-title" }, botProfile.label),
              h("div", { className: "sp-botmenu-sub" },
                botProfile.prefix + " commands \u00b7 sent as you")),
            h("button", {
              className: "sp-btn",
              title: "Close",
              onClick: () => { setBotMenuOpen(false); setShowCustomCommand(false); },
            }, icon("close", 16))),
          botNotice
            ? h("div", {
                className: "sp-botmenu-notice " + (botNotice.ok ? "sp-status-ok" : "sp-status-bad"),
              }, botNotice.text)
            : null,
          menuActions.map((action) => h("button", {
            key: action.id,
            className: "sp-botmenu-item",
            onClick: () => sendBotCommand(action.id),
          },
            h("span", null, action.label),
            h("span", { className: "sp-botmenu-cmd" },
              plugin.formatMusicCommand(action.id, track) || action.template))),
          showCustomCommand
            ? h("div", { className: "sp-botmenu-custom" },
                h("input", {
                  className: "sp-search-input",
                  placeholder: botProfile.prefix + "volume 20",
                  value: customCommand,
                  onChange: (e) => setCustomCommand(e.target.value),
                  onKeyDown: (e) => { if (e.key === "Enter") sendBotRaw(); },
                }),
                h("div", { className: "sp-botmenu-custom-row" },
                  h("button", { className: "sp-primary-btn", onClick: sendBotRaw }, "Send"),
                  h("button", {
                    className: "sp-textbtn",
                    onClick: () => { setShowCustomCommand(false); setCustomCommand(""); },
                  }, "Cancel")))
            : h("button", {
                className: "sp-botmenu-item",
                onClick: () => setShowCustomCommand(true),
              },
                h("span", null, "Custom command..."),
                icon("send", 16)))
      ]
    : null;

  return h(
    "div",
    {
      id: "spotifypanel-panel",
      className: (plugin.settings.visible ? "" : "sp-hidden ") + (panelW < 360 ? "sp-narrow" : ""),
      style: {
        width: (Number(plugin.settings.width) || 420) + "px",
        ...(plugin.settings.fullHeight ? { bottom: (Number(plugin.settings.topOffset) || 12) + "px" } : { height: panelHeight + "px" }),
        top: (Number(plugin.settings.topOffset) || 12) + "px",
      },
    },
    h("div", {
      className: "sp-edge",
      onMouseDown: (e) => { e.preventDefault(); e.stopPropagation(); },
      onPointerDown: (e) => { e.stopPropagation(); },
      title: "",
    }),
    h("div", { className: "sp-resize", onMouseDown: (e) => startResize(e, plugin) }),
    h(
      "div",
      { className: "sp-nav" },
      h("button", {
        className: "sp-btn sp-nav-back",
        title: view === "now" ? "Open playlists" : "Back to player",
        onClick: () => {
          if (view === "now") {
            setTab("playlists");
            setOpenList(null);
            setResults(null);
            setView("browse");
          } else {
            setView("now");
          }
        },
      }, icon("back", 22)),
      h("div", { className: "sp-nav-right" },
        h("button", {
          className: "sp-btn" + (menuOpen ? " sp-active" : ""),
          title: "More",
          onClick: () => setMenuOpen(!menuOpen),
        }, icon("dotsVertical", 20))
      )
    ),
    menuOpen
      ? h("div", { className: "sp-menu" },
          track?.external_urls?.spotify
            ? h("a", {
                className: "sp-menu-item",
                href: track.external_urls.spotify,
                target: "_blank",
                rel: "noreferrer",
              }, h("span", null, "Open in Spotify"), icon("external", 14))
            : null,
          h("button", {
            className: "sp-menu-item",
            onClick: () => { setMenuOpen(false); pushHistory(); setView("browse"); },
          }, h("span", null, "Browse library"), icon("list", 14)),
          h("button", {
            className: "sp-menu-item",
            onClick: () => { setMenuOpen(false); pushHistory(); setView("queue"); },
          }, h("span", null, "Queue"), icon("queue", 14)),
          h("button", {
            className: "sp-menu-item",
            onClick: () => {
              setMenuOpen(false);
              setError(null);
              setView("settings");
            },
          }, h("span", null, "Connect Spotify"), icon("external", 14)),
          h("button", {
            className: "sp-menu-item",
            onClick: () => { setMenuOpen(false); pushHistory(); setView("settings"); },
          }, h("span", null, "Panel settings"), icon("dotsVertical", 14)),
          h("div", { className: "sp-menu-sep" }),
          h("div", { className: "sp-menu-vol" },
            h("button", {
              className: "sp-btn",
              title: volume > 0 ? "Mute" : "Unmute",
              onClick: () => changeVolume(volume > 0 ? 0 : 60),
            }, icon("volume", 16)),
            h("input", {
              className: "sp-vol-range",
              type: "range",
              min: "0",
              max: "100",
              step: "1",
              value: String(volume),
              style: { backgroundSize: volume + "% 2px, 100% 2px" },
              onChange: (e) => changeVolume(Number(e.target.value)),
            })
          ),
          devices.length
            ? h("div", { className: "sp-menu-devices" },
                devices.slice(0, 4).map((d) =>
                  h("span", {
                    key: d.id,
                    className: "sp-device" + (d.is_active ? " sp-current" : ""),
                    title: d.name,
                    onClick: () => run(() => plugin.transfer(d.id)),
                  }, d.name)))
            : null
        )
      : null,
    view === "settings"
      ? settingsNode
      : !plugin.settings.refreshToken
        ? connectNode
      : view === "browse"
        ? browseNode
        : view === "queue"
          ? queueNode
        : h(
        "div",
        { className: "sp-body sp-now" },
        renderPlayer(),
        error && error !== "not connected"
          ? h("div", { className: "sp-error" }, error)
          : null
      ),
    botMenuNode
  );
}

function startResize(e, plugin) {
  e.preventDefault();
  const startY = e.clientY;
  const startH = Number(plugin.settings.height) || 330;
  const move = (ev) => {
    const height = Math.max(200, Math.min(520, startH + (startY - ev.clientY)));
    plugin.settings.height = height;
    plugin.applyStackVar();
    plugin._bump?.();
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    plugin.save();
    plugin.applyStackVar();
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

module.exports = SpotifyPanel;






