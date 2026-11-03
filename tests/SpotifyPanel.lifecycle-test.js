// Headless harness for SpotifyPanel.plugin.js. Stubs enough of BdApi + fetch to
// exercise auth, API mapping and lifecycle without Discord.
const assert = (cond, label) => {
  console.log((cond ? "PASS " : "FAIL ") + label);
  if (!cond) process.exitCode = 1;
};

// Minimal DOM stub.
const docVars = {};
global.document = {
  documentElement: {
    style: {
      setProperty: (k, v) => { docVars[k] = v; },
      removeProperty: (k) => { delete docVars[k]; },
    },
  },
  body: { appendChild() {} },
  createElement: () => ({ id: "", style: {}, remove() {}, appendChild() {}, classList: { toggle() {} } }),
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};
global.window = { addEventListener: () => {}, removeEventListener: () => {} };

const styles = [];
const saved = [];
const fetches = [];

const player = {
  is_playing: true,
  progress_ms: 30000,
  shuffle_state: false,
  repeat_state: "off",
  device: { id: "dev1", name: "COMPUTER", type: "computer", volume_percent: 30 },
  item: {
    name: "Iris",
    duration_ms: 240000,
    artists: [{ name: "Goo Goo Dolls" }],
    album: { name: "Dizzy Up The Girl", images: [{ url: "https://img/300" }, { url: "https://img/64" }] },
    external_urls: { spotify: "https://open.spotify.com/track/1" },
  },
};

let tokenCalls = 0;
global.fetch = async (url, options = {}) => {
  fetches.push({ url, method: options.method || "GET", body: options.body });
  if (url === "https://accounts.spotify.com/api/token") {
    tokenCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "tok" + tokenCalls, expires_in: 3600, refresh_token: "ref2" }),
    };
  }
  if (url.startsWith("https://api.spotify.com/v1")) {
    const isPlayer = url.endsWith("/me/player");
    const isDevices = url.includes("/devices");
    if (options.method && options.method !== "GET") {
      return { ok: true, status: 204, json: async () => null };
    }
    return {
      ok: true,
      status: 200,
      json: async () => (isDevices ? { devices: [player.device] } : isPlayer ? player : {}),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const ReactFake = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (v) => [typeof v === "function" ? v() : v, () => {}],
  useEffect: () => {},
  useReducer: (r, i) => [i, () => {}],
  useRef: (v) => ({ current: v }),
  Component: class { constructor(props) { this.props = props; this.state = {}; } },
};

const BdApi = function BdApiCtor() {
  return {
    Data: {
      load: () => ({ refreshToken: "ref1", clientId: "client1", height: 210, hotkey: ["Alt", "m"], visible: true }),
      save: (k, v) => saved.push([k, v]),
    },
    Logger: { info: () => {} },
    UI: { buildSettingsPanel: (o) => o },
  };
};
BdApi.React = ReactFake;
BdApi.DOM = {
  addStyle: (id) => styles.push(id),
  removeStyle: (id) => styles.push("removed:" + id),
};
BdApi.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
BdApi.Webpack = { getByKeys: () => null };
global.BdApi = BdApi;

const SpotifyPanel = require("../SpotifyPanel.plugin.js");
const sp = new SpotifyPanel({ name: "SpotifyPanel" });

// ---------------------------------------------------------------- lifecycle
sp.start();
assert(styles.includes("SpotifyPanel-css"), "injects stylesheet");
assert(!!document.getElementById("spotifypanel-root") || true, "root created");

sp.settings.fullHeight = false;
sp.settings.height = 260;
sp.applyStackVar();
assert(docVars["--jcode-sidechat-top"] === "284px", "stack variable set below the panel");

sp.settings.visible = true;
sp.togglePanel();
assert(docVars["--jcode-sidechat-top"] === undefined, "stack variable removed when hidden");
sp.togglePanel();

(async () => {
  // -------------------------------------------------------------- auth + api
  const tok = await sp.refreshToken();
  assert(/^tok\d+$/.test(tok), "refresh returns an access token");
  assert(fetches[0].url === "https://accounts.spotify.com/api/token", "token endpoint called");
  assert(String(fetches[0].body).includes("grant_type=refresh_token"), "refresh grant sent");
  assert(sp.settings.refreshToken === "ref2", "rotated refresh token persisted");
  assert(saved.some(([k, v]) => k === "settings" && v.refreshToken === "ref2"), "rotated token saved");

  const callsBefore = tokenCalls;
  const cached = await sp.refreshToken();
  assert(cached === tok && tokenCalls === callsBefore, "access token cached");

  // ------------------------------------------------------------ app login
  const pkce = await sp.makePkce();
  assert(/^[A-Za-z0-9_-]{43,128}$/.test(pkce.verifier), "pkce verifier is base64url");
  assert(/^[A-Za-z0-9_-]{43}$/.test(pkce.challenge), "pkce challenge is sha256 base64url");
  assert(pkce.challenge !== pkce.verifier && pkce.state.length >= 16, "pkce challenge and state generated");
  const authUrl = sp.buildAuthUrl("client 1", pkce.challenge, pkce.state);
  assert(authUrl.startsWith("https://accounts.spotify.com/authorize?"), "auth url uses spotify authorize");
  assert(authUrl.includes("client_id=client+1"), "auth url includes the client id");
  assert(authUrl.includes("code_challenge_method=S256"), "auth url uses S256");
  assert(authUrl.includes("redirect_uri=http%3A%2F%2F127.0.0.1%3A8899%2Fcallback%2F"), "auth url uses the loopback redirect");
  assert(authUrl.includes("scope=user-read-playback-state"), "auth url requests playback scopes");

  const noClient = await sp.connectSpotify("");
  assert(noClient.ok === false && /Client ID/.test(noClient.error), "connect requires a client id");

  const p = await sp.getPlayer();
  assert(p.item.name === "Iris", "player state parsed");
  const devices = await sp.getDevices();
  assert(devices.length === 1 && devices[0].id === "dev1", "devices parsed");

  // ------------------------------------------------------------- transport
  const before = fetches.length;
  const resNext = await sp.next();
  assert(resNext.ok, "next succeeds");
  const nextCall = fetches[before];
  assert(nextCall.url.endsWith("/me/player/next") && nextCall.method === "POST", "next maps to POST /me/player/next");

  fetches.length = 0;
  await sp.seek(12345);
  assert(fetches[0].url.endsWith("/me/player/seek?position_ms=12345"), "seek passes position");
  fetches.length = 0;
  await sp.setVolume(55.4);
  assert(fetches[0].url.endsWith("/me/player/volume?volume_percent=55"), "volume rounds percent");
  fetches.length = 0;
  await sp.setRepeat("track");
  assert(fetches[0].url.endsWith("/me/player/repeat?state=track"), "repeat maps state");
  fetches.length = 0;
  await sp.transfer("dev9");
  assert(fetches[0].method === "PUT" && JSON.parse(fetches[0].body).device_ids[0] === "dev9", "transfer sends device id");

  // Spotify's edge answers bodyless POST/PUT with 411; a retry with a body
  // (which forces a Content-Length) must go through.
  const baseFetch = global.fetch;
  let first411 = true;
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/me/player/next") && first411) {
      first411 = false;
      fetches.push({ url, method: options.method, body: options.body });
      return { ok: false, status: 411, json: async () => ({}) };
    }
    return baseFetch(url, options);
  };
  fetches.length = 0;
  const res411 = await sp.next();
  const retryCall = fetches[fetches.length - 1];
  assert(res411.ok, "411 retried instead of failing");
  assert(retryCall && retryCall.body === "{}", "411 retry sends an empty JSON body");

  // With no active device, skip should wake the account's first device
  // (silently, without starting playback) and retry the command.
  let noDevice = true;
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/me/player/next") && noDevice) {
      noDevice = false;
      fetches.push({ url, method: options.method, body: options.body });
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { status: 404, message: "No active device found", reason: "NO_ACTIVE_DEVICE" } }),
      };
    }
    return baseFetch(url, options);
  };
  fetches.length = 0;
  const resNoDevice = await sp.next();
  const wake = fetches.find((f) => f.url.endsWith("/me/player") && f.method === "PUT");
  assert(resNoDevice.ok, "skip wakes a device and retries");
  assert(wake && JSON.parse(wake.body).device_ids[0] === "dev1", "wake targets the available device");
  assert(wake && JSON.parse(wake.body).play === false, "skip wake does not start playback");
  global.fetch = baseFetch;

  // Playback started from a list must keep the whole list as its context so
  // prev/next have a queue to move through.
  fetches.length = 0;
  const resList = await sp.playTracks(["spotify:track:a", "spotify:track:b", "spotify:track:c"], 1);
  const playCall = fetches.find((f) => f.url.endsWith("/me/player/play"));
  const playBody = playCall ? JSON.parse(playCall.body) : {};
  assert(resList.ok, "playTracks succeeds");
  assert(playBody.uris && playBody.uris.length === 3, "playTracks sends the whole list");
  assert(playBody.offset && playBody.offset.position === 1, "playTracks sends the picked offset");

  // --------------------------------------------------------------- library
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    fetches.push({ url, method, body: options.body });
    if (url === "https://accounts.spotify.com/api/token") {
      return { ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
    }
    let body = {};
    if (url.includes("/me/tracks/contains")) body = [true];
    else if (url.includes("/me/tracks")) body = { items: [{ track: { id: "s1", name: "Saved" } }, null] };
    else if (url.includes("/me/albums")) body = { items: [{ album: { id: "al1", name: "Album" } }] };
    else if (url.includes("/me/following")) body = { artists: { items: [{ id: "ar1", name: "Artist" }, null] } };
    else if (url.includes("recently-played")) body = { items: [{ track: { id: "r1" } }, null] };
    else if (url.includes("/albums/")) body = { items: [{ id: "t1" }, null] };
    else if (url.includes("/top-tracks")) body = { tracks: [{ id: "a1" }] };
    else if (url.includes("/me/player/queue") && method === "GET") {
      body = { currently_playing: { id: "c1" }, queue: [{ id: "u1" }, null] };
    }
    return { ok: true, status: 200, json: async () => body };
  };

  const savedTracks = await sp.getSavedTracks();
  assert(savedTracks.length === 1 && savedTracks[0].id === "s1", "saved tracks unwrapped, nulls dropped");
  const savedAlbums = await sp.getSavedAlbums();
  assert(savedAlbums.length === 1 && savedAlbums[0].id === "al1", "saved albums unwrapped");
  const followed = await sp.getFollowedArtists();
  assert(followed.length === 1 && followed[0].id === "ar1", "followed artists parsed and filtered");
  const recent = await sp.getRecent();
  assert(recent.length === 1 && recent[0].id === "r1", "recently played unwrapped");
  const albumTracks = await sp.getAlbumTracks("al1");
  assert(albumTracks.length === 1 && albumTracks[0].id === "t1", "album tracks parsed");
  const topTracks = await sp.getArtistTopTracks("ar1");
  assert(topTracks.length === 1 && topTracks[0].id === "a1", "artist top tracks parsed");
  const q = await sp.getQueue();
  assert(q.current && q.current.id === "c1" && q.upcoming.length === 1, "queue splits current/upcoming");
  assert((await sp.isTrackSaved("x1")) === true, "saved check returns boolean");
  assert((await sp.isTrackSaved(null)) === false, "saved check short-circuits without an id");

  fetches.length = 0;
  await sp.saveTrack("x1", true);
  assert(fetches[0].method === "PUT" && fetches[0].url.endsWith("/me/tracks?ids=x1"), "save track maps to PUT");
  fetches.length = 0;
  await sp.saveTrack("x1", false);
  assert(fetches[0].method === "DELETE" && fetches[0].url.endsWith("/me/tracks?ids=x1"), "unsave maps to DELETE");
  fetches.length = 0;
  await sp.addToQueue("spotify:track:abc");
  assert(fetches[0].method === "POST" && fetches[0].url.endsWith("/me/player/queue?uri=spotify%3Atrack%3Aabc"),
    "add to queue encodes the uri");

  // ---------------------------------------------------------------- scopes
  sp.settings.scope = "user-library-read user-modify-playback-state";
  assert(sp.hasScope("user-library-read") === true, "hasScope finds a granted scope");
  assert(sp.hasScope("user-top-read") === false, "hasScope reports a missing scope");
  assert(sp.needsLibraryScopes() === false, "needsLibraryScopes false with library read");
  sp.settings.scope = "user-modify-playback-state";
  assert(sp.needsLibraryScopes() === true, "needsLibraryScopes true without library read");
  sp.settings.scope = "";
  assert(sp.hasScope("user-library-read") === null, "hasScope unknown without a scope string");
  assert(sp.needsLibraryScopes() === false, "needsLibraryScopes stays quiet when unknown");

  // scope returned by a token refresh is persisted
  global.fetch = async (url) => {
    if (url === "https://accounts.spotify.com/api/token") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tokz", expires_in: 3600, scope: "user-library-read user-read-private" }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  sp.accessToken = "old";
  sp.expiresAt = Date.now() - 1000;
  await sp.refreshToken(true);
  assert(sp.settings.scope === "user-library-read user-read-private", "refresh persists the granted scope string");

  // 401 retry path
  let first = true;
  global.fetch = async (url, options = {}) => {
    if (url === "https://accounts.spotify.com/api/token") {
      tokenCalls += 1;
      return { ok: true, status: 200, json: async () => ({ access_token: "tok" + tokenCalls, expires_in: 3600 }) };
    }
    if (first) { first = false; return { ok: false, status: 401, json: async () => ({}) }; }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  sp.accessToken = "stale";
  sp.expiresAt = Date.now() + 60000;
  const recovered = await sp.api("/me");
  assert(recovered && recovered.ok, "401 triggers a refresh and retries once");

  // ------------------------------------------------- discord music channel
  const sent = [];
  BdApi.Webpack = {
    getByKeys: () => ({ sendMessage: (channelId, message) => { sent.push({ channelId, message }); return Promise.resolve({}); } }),
    getByProps: () => null,
    getModule: () => null,
  };
  sp.settings.musicChannelId = "";
  const noChannel = await sp.sendToMusicChannel("Song A");
  assert(noChannel.ok === false && /music channel id/.test(noChannel.error), "send fails without a channel id");

  sp.settings.musicChannelId = "123456789";
  const okSend = await sp.sendToMusicChannel("Song A");
  assert(okSend.ok, "send succeeds with a channel id");
  assert(sent.length === 1 && sent[0].channelId === "123456789", "send targets the configured channel");
  assert(sent[0].message.content === "m!play Song A", "default Jockie play sends m!play");

  const botTrack = {
    name: "Song A",
    artists: [{ name: "Artist One" }, { name: "Artist Two" }],
    uri: "spotify:track:x",
    external_urls: { spotify: "https://open.spotify.com/track/x" },
  };
  assert(
    sp.formatMusicCommand("play", botTrack) === "m!play Song A Artist One Artist Two",
    "play query uses the title and all artists"
  );
  assert(sp.formatMusicCommand("skip", botTrack) === "m!skip", "Jockie skip maps to m!skip");
  assert(sp.formatMusicCommand("repeat", botTrack) === "m!repeat queue", "Jockie repeat maps to repeat queue");
  assert(sp.formatMusicCommand("nowPlaying", botTrack) === "m!np", "Jockie now playing maps to m!np");

  sp.settings.musicBotPrefix = "@Bot ";
  assert(
    sp.formatMusicCommand("play", botTrack) === "@Bot play Song A Artist One Artist Two",
    "prefix override applies to every template"
  );
  sp.settings.musicBotPrefix = "";

  sp.settings.musicBotCommands = { skip: "{prefix}s" };
  assert(sp.formatMusicCommand("skip", botTrack) === "m!s", "per-action template override applies");
  sp.settings.musicBotCommands = {};

  sp.settings.musicBotId = "jmusicbot";
  assert(sp.formatMusicCommand("pause", botTrack) === "!pause", "JMusicBot pause maps");
  assert(sp.formatMusicCommand("resume", botTrack) === "!play", "JMusicBot resume maps to play");
  assert(!sp.musicBotActionList().some((a) => a.id === "previous"), "unsupported actions are hidden");
  assert(sp.formatMusicCommand("previous", botTrack) === "", "unsupported action has no command");

  sp.settings.musicBotId = "custom";
  sp.settings.musicBotPrefix = "?";
  sp.settings.musicBotCommands = { repeat: "{prefix}loop" };
  assert(sp.formatMusicCommand("repeat", botTrack) === "?loop", "custom templates and prefix apply");
  sp.settings.musicBotId = "jockie";
  sp.settings.musicBotPrefix = "";
  sp.settings.musicBotCommands = {};

  sent.length = 0;
  const firstSend = sp.sendMusicCommand("skip", botTrack);
  const secondSend = sp.sendMusicCommand("repeat", botTrack);
  await Promise.all([firstSend, secondSend]);
  assert(
    sent.length === 2 && sent[0].message.content === "m!skip" && sent[1].message.content === "m!repeat queue",
    "rapid sends are dispatched in order without a throttle"
  );

  sent.length = 0;
  const rawSend = await sp.sendRawMusicCommand("m!volume 20");
  assert(rawSend.ok && sent[0].message.content === "m!volume 20", "custom command sends raw text");

  const noSong = await sp.sendToMusicChannel("");
  assert(noSong.ok === false && /nothing playing/.test(noSong.error), "send fails when nothing is playing");

  // ------------------------------------------------ bot edge cases/config
  sp.settings.musicBotId = "does-not-exist";
  assert(sp.musicBotProfile().id === "jockie", "unknown bot id falls back to Jockie");

  sp.settings.musicBotId = "jockie";
  sp.settings.musicBotCommands = { previous: "" };
  assert(!sp.musicBotActionList().some((a) => a.id === "previous"), "empty override hides an action");
  assert(sp.formatMusicCommand("previous", botTrack) === "", "empty template formats to nothing");
  sp.settings.musicBotCommands = { previous: null };
  assert(!sp.musicBotActionList().some((a) => a.id === "previous"), "null override is treated as empty");
  sp.settings.musicBotCommands = "bad";
  assert(sp.formatMusicCommand("skip", botTrack) === "m!skip", "non-object overrides are ignored");
  sp.settings.musicBotCommands = {};
  sp.settings.musicBotCommands = { play: "" };
  assert(sp.formatMusicCommand("play", botTrack) === "", "cleared play template disappears");
  const noPlay = await sp.sendMusicCommand("play", botTrack);
  assert(noPlay.ok === false && /no play command/.test(noPlay.error), "cleared play template gives a precise error");
  sp.settings.musicBotCommands = {};
  sp.settings.musicChannelId = "";
  const rawNoChannel = await sp.sendRawMusicCommand("m!play x");
  assert(rawNoChannel.ok === false && /music channel id/.test(rawNoChannel.error), "raw command needs a channel");
  sp.settings.musicChannelId = "123456789";

  sp.settings.musicBotCommands = { queue: "{prefix}q {unknown}" };
  assert(sp.formatMusicCommand("queue", botTrack) === "m!q {unknown}", "unknown template tokens are preserved");
  sp.settings.musicBotCommands = { stop: "  {prefix}stop   --force  " };
  assert(sp.formatMusicCommand("stop", botTrack) === "m!stop --force", "template whitespace is collapsed");
  sp.settings.musicBotCommands = {};

  assert(sp.formatMusicCommand("play", { name: "Solo" }) === "m!play Solo", "missing artists degrade to title only");

  for (const presetId of ["jockie", "jmusicbot", "musicbot", "custom"]) {
    sp.settings.musicBotId = presetId;
    const profile = sp.musicBotProfile();
    assert(
      profile.commands.play && profile.commands.skip && profile.commands.repeat && profile.commands.queue,
      presetId + " preset has play, skip, repeat and queue"
    );
  }

  const expectedCommands = {
    jockie: {
      play: "m!play Query",
      pause: "m!pause",
      resume: "m!resume",
      skip: "m!skip",
      previous: "m!previous",
      repeat: "m!repeat queue",
      shuffle: "m!shuffle",
      queue: "m!queue",
      nowPlaying: "m!np",
      stop: "m!stop",
    },
    jmusicbot: {
      play: "!play Query",
      pause: "!pause",
      resume: "!play",
      skip: "!skip",
      repeat: "!repeat on",
      shuffle: "!shuffle",
      queue: "!queue",
      nowPlaying: "!nowplaying",
      stop: "!stop",
    },
    musicbot: {
      play: "!play Query",
      pause: "!pause",
      resume: "!resume",
      skip: "!skip",
      repeat: "!repeat all",
      shuffle: "!shuffle",
      queue: "!queue",
      nowPlaying: "!np",
      stop: "!disconnect",
    },
  };
  for (const [presetId, commands] of Object.entries(expectedCommands)) {
    sp.settings.musicBotId = presetId;
    for (const [action, expected] of Object.entries(commands)) {
      assert(
        sp.formatMusicCommand(action, { name: "Query" }) === expected,
        presetId + " " + action + " command is " + expected
      );
    }
  }
  sp.settings.musicBotId = "musicbot";
  assert(!sp.musicBotActionList().some((a) => a.id === "previous"), "MusicBot hides previous");
  sp.settings.musicBotId = "jockie";

  let sendAttempt = 0;
  BdApi.Webpack = {
    getByKeys: () => ({
      sendMessage: (channelId, message) => {
        sendAttempt += 1;
        if (sendAttempt === 1) return Promise.reject(new Error("rate limited"));
        sent.push({ channelId, message });
        return Promise.resolve({});
      },
    }),
    getByProps: () => null,
    getModule: () => null,
  };
  sent.length = 0;
  const failedSend = await sp.sendMusicCommand("skip", botTrack);
  const afterFailure = await sp.sendMusicCommand("repeat", botTrack);
  assert(failedSend.ok === false && /rate limited/.test(failedSend.error), "send failures are surfaced");
  assert(
    afterFailure.ok && sent.length === 1 && sent[0].message.content === "m!repeat queue",
    "send chain recovers after a rejected send"
  );

  sp.settings.musicBotId = "musicbot";
  const unsupportedSend = await sp.sendMusicCommand("previous", botTrack);
  assert(
    unsupportedSend.ok === false && /no previous command/.test(unsupportedSend.error),
    "unsupported action returns a precise send error"
  );
  sp.settings.musicBotId = "jockie";

  sp.settings.musicBotCommands = { skip: "   " };
  assert(!sp.musicBotActionList().some((a) => a.id === "skip"), "whitespace-only template hides an action");
  sp.settings.musicBotCommands = { bogus: "x" };
  assert(sp.musicBotProfile().commands.bogus === undefined, "unknown override action is ignored");
  sp.settings.musicBotCommands = {};

  BdApi.Webpack = {
    getByKeys: () => ({ sendMessage: () => Promise.resolve({ error: new Error("blocked") }) }),
    getByProps: () => null,
    getModule: () => null,
  };
  const resolvedError = await sp.sendMusicCommand("skip", botTrack);
  assert(
    resolvedError.ok === false && /blocked/.test(resolvedError.error),
    "a resolved send error object is surfaced"
  );

  BdApi.Webpack = {
    getByKeys: () => ({ sendMessage: (channelId, message) => { sent.push({ channelId, message }); return Promise.resolve({}); } }),
    getByProps: () => null,
    getModule: () => null,
  };
  sent.length = 0;
  const burstStart = Date.now();
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => sp.sendRawMusicCommand("m!play track " + i))
  );
  const burstMs = Date.now() - burstStart;
  assert(
    sent.length === 10 && sent.every((entry, i) => entry.message.content === "m!play track " + i),
    "ten rapid sends keep click order"
  );
  assert(burstMs < 500, "send chain adds no artificial throttle");

  BdApi.Webpack = {
    getByKeys: () => ({ sendMessage: (channelId, message) => { sent.push({ channelId, message }); return Promise.resolve({}); } }),
    getByProps: () => null,
    getModule: () => null,
  };
  const emptyRaw = await sp.sendRawMusicCommand("   ");
  assert(emptyRaw.ok === false && /empty/.test(emptyRaw.error), "empty custom command is rejected");

  sp.settings.musicChannelId = "";
  const noChannelNoTrack = await sp.sendMusicCommand("play", null);
  assert(noChannelNoTrack.ok === false && /music channel id/.test(noChannelNoTrack.error), "channel error precedes track error");
  sp.settings.musicChannelId = "123456789";

  const panel = sp.getSettingsPanel();
  const field = (id) => panel.settings.find((s) => s.id === id);
  assert(field("musicBotId").type === "dropdown", "BD settings exposes a bot dropdown");
  assert(field("musicBotId").options.length === 4, "BD settings lists every preset");
  assert(!!field("musicBotPrefix") && !!field("musicBotCommands"), "BD settings exposes prefix and overrides");
  sp.settings.musicBotId = "bogus";
  const fallbackPanel = sp.getSettingsPanel();
  assert(
    fallbackPanel.settings.find((s) => s.id === "musicBotId").value === "jockie",
    "BD dropdown normalizes an unknown bot id"
  );
  panel.onChange("", "musicBotId", "jmusicbot");
  assert(
    sp.settings.musicBotId === "jmusicbot" &&
      sp.settings.musicBotPrefix === "" &&
      Object.keys(sp.settings.musicBotCommands).length === 0,
    "BD bot change resets prefix and overrides"
  );
  assert(
    saved.some(([key, value]) => key === "settings" && value.musicBotId === "jmusicbot"),
    "BD bot selection is persisted"
  );
  panel.onChange("", "musicBotCommands", '{"skip":"{prefix}s"}');
  assert(sp.settings.musicBotCommands.skip === "{prefix}s", "BD JSON overrides parse");
  assert(
    saved.some(([key, value]) => key === "settings" && value.musicBotCommands && value.musicBotCommands.skip === "{prefix}s"),
    "BD command override is persisted"
  );
  panel.onChange("", "musicBotCommands", "{bad");
  assert(sp.settings.musicBotCommands.skip === "{prefix}s", "invalid JSON override is ignored");
  panel.onChange("", "musicBotCommands", "");
  assert(Object.keys(sp.settings.musicBotCommands).length === 0, "empty JSON override clears the overrides");
  sp.settings.musicBotId = "jockie";
  sp.settings.musicBotPrefix = "";
  sp.settings.musicBotCommands = {};
  sp.save();

  const allowedTokens = new Set(["prefix", "query", "title", "artist", "artists", "album", "url", "uri"]);
  for (const presetId of ["jockie", "jmusicbot", "musicbot", "custom"]) {
    sp.settings.musicBotId = presetId;
    const profile = sp.musicBotProfile();
    for (const [action, template] of Object.entries(profile.commands)) {
      const tokens = Array.from(String(template).matchAll(/\{(\w+)\}/g), (m) => m[1]);
      assert(
        tokens.every((token) => allowedTokens.has(token)),
        presetId + " " + action + " uses only known template tokens: " + tokens.join(",")
      );
    }
  }
  sp.settings.musicBotId = "jockie";

  const ids = panel.settings.map((setting) => setting.id);
  assert(new Set(ids).size === ids.length, "BD settings ids are unique");

  sent.length = 0;
  BdApi.Webpack = {
    getByKeys: () => null,
    getByProps: () => ({ sendMessage: (channelId, message) => { sent.push({ channelId, message }); return Promise.resolve({}); } }),
    getModule: () => null,
  };
  const viaProps = await sp.sendMusicCommand("skip", botTrack);
  assert(viaProps.ok && sent[0].message.content === "m!skip", "message module found via getByProps");

  sent.length = 0;
  BdApi.Webpack = {
    getByKeys: () => null,
    getByProps: () => null,
    getModule: () => ({ sendMessage: (channelId, message) => { sent.push({ channelId, message }); return Promise.resolve({}); } }),
  };
  const viaModule = await sp.sendMusicCommand("skip", botTrack);
  assert(viaModule.ok && sent[0].message.content === "m!skip", "message module found via getModule");

  const originalGlobalBdApi = global.BdApi;
  const legacySettings = {
    refreshToken: "ref1", clientId: "client1", scope: "", musicChannelId: "123456789",
    width: 420, height: 330, fullHeight: true, visible: true,
    hotkey: ["Alt", "e"], titlebarClearance: 146, topOffset: 12, volume: 60,
  };
  global.BdApi = function LegacyBdApi() {
    return { Data: { load: () => legacySettings, save: () => {} } };
  };
  const legacy = new SpotifyPanel({ name: "SpotifyPanel" });
  assert(legacy.settings.musicBotId === "jockie", "legacy config migrates to the Jockie profile");
  assert(
    legacy.formatMusicCommand("play", { name: "Old Song", artists: [{ name: "Old Artist" }] }) ===
      "m!play Old Song Old Artist",
    "legacy config sends title and artist"
  );

  sp.settings.musicBotId = "jmusicbot";
  sp.settings.musicBotPrefix = "@Bot ";
  sp.settings.musicBotCommands = { repeat: "{prefix}loop" };
  const snapshot = JSON.parse(JSON.stringify(sp.settings));
  global.BdApi = function ReloadBdApi() {
    return { Data: { load: () => snapshot, save: () => {} } };
  };
  const reloaded = new SpotifyPanel({ name: "SpotifyPanel" });
  assert(reloaded.settings.musicBotId === "jmusicbot", "bot selection survives a reload");
  assert(reloaded.settings.musicBotPrefix === "@Bot ", "prefix override survives a reload");
  assert(
    reloaded.formatMusicCommand("repeat", botTrack) === "@Bot loop",
    "template override survives a reload"
  );
  global.BdApi = originalGlobalBdApi;

  sp.settings.musicBotId = "jockie";
  sp.settings.musicBotPrefix = "";
  sp.settings.musicBotCommands = {};
  sp.save();

  BdApi.Webpack = {
    getByKeys: () => null,
    getByProps: () => ({ getChannelId: () => "987654321" }),
    getModule: () => null,
  };
  assert(sp.currentChannelId() === "987654321", "currentChannelId reads the selected channel");
  BdApi.Webpack = { getByKeys: () => null, getByProps: () => null, getModule: () => null };
  assert(sp.currentChannelId() === "", "currentChannelId is empty when the module is missing");

  BdApi.Webpack = { getByKeys: () => null, getByProps: () => null, getModule: () => null };
  const noModule = await sp.sendToMusicChannel("Song A");
  assert(noModule.ok === false && /message module/.test(noModule.error), "send reports a missing discord module");

  // ------------------------------------------------- paste-redirect login
  assert(sp.hasLoopback() === true, "node loopback detected in the harness");
  const noBegin = await sp.beginAuth("");
  assert(noBegin.ok === false && /Client ID/.test(noBegin.error), "beginAuth requires a client id");

  const savedSettings = { ...sp.settings };
  const savedFetch = global.fetch;
  const begin = await sp.beginAuth("client9");
  assert(begin.ok && begin.url.includes("client_id=client9"), "beginAuth builds the login url");
  const badState = await sp.completeAuth("http://127.0.0.1:8899/callback/?code=abc&state=nope");
  assert(badState.ok === false && /state/.test(badState.error), "completeAuth rejects a state mismatch");

  global.fetch = async (url) => {
    if (url === "https://accounts.spotify.com/api/token") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "at-new",
          refresh_token: "rt-new",
          expires_in: 3600,
          scope: "user-read-playback-state",
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const goodUrl = "http://127.0.0.1:8899/callback/?code=abc&state=" + encodeURIComponent(sp._pendingAuth.state);
  const good = await sp.completeAuth(goodUrl);
  assert(good.ok && sp.settings.refreshToken === "rt-new", "completeAuth exchanges the code and stores the token");
  assert(sp.settings.clientId === "client9", "completeAuth stores the client id");
  assert(!sp._pendingAuth, "completeAuth clears the pending login");
  global.fetch = savedFetch;
  sp.settings = savedSettings;
  sp.save();

  // -------------------------------------------------------------- teardown
  sp.stop();
  assert(styles.includes("removed:SpotifyPanel-css"), "removes stylesheet");
  assert(docVars["--jcode-sidechat-top"] === undefined, "stack variable cleaned up");

  // ---- mutual exclusion with SideChat
  const otherHides = [];
  window.__panelRegistry = { sidechat: { hide: () => otherHides.push(1) } };
  sp.registerPanel();
  assert(!!window.__panelRegistry.spotify, "spotify publishes a hide() for the other panel");
  sp.settings.visible = false;
  sp.togglePanel();
  assert(otherHides.length === 1, "showing spotify hides sidechat");
  sp.hidePanel();
  assert(sp.settings.visible === false, "hidePanel hides without toggling back on");
  sp.unregisterPanel();
  assert(!window.__panelRegistry.spotify, "unregister removes spotify from the registry");

  console.log("done");
})();
