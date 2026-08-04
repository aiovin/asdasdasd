(() => {
  "use strict";

  let catalogById = {};
  let REAL_WORDLIST_IDS = [];

  function humanize(id) {
    return id
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  async function loadManifest() {
    const res = await fetch("data/manifest.json");
    if (!res.ok) throw new Error(`Failed to load data/manifest.json (${res.status})`);
    const manifest = await res.json();
    const entries = Array.isArray(manifest.wordlists) ? manifest.wordlists : [];
    if (entries.length === 0) throw new Error("data/manifest.json is empty — no dictionaries are defined.");

    const catalog = {};
    const ids = [];
    for (const entry of entries) {
      if (!entry.file) continue;
      const id = entry.id || entry.file.replace(/\.txt$/i, "");
      catalog[id] = {
        id,
        file: `data/${entry.file}`,
        label: entry.label || humanize(id),
        description: entry.description || null,
        count: null,
      };
      ids.push(id);
    }
    return { catalog, ids };
  }

  // Case functions - mirror xkcdpass.xkcd_password.CASE_METHODS
  const CASE_METHODS = {
    "as-is": (words) => words,
    lower: (words) => words.map((w) => w.toLowerCase()),
    upper: (words) => words.map((w) => w.toUpperCase()),
    capitalize: (words) =>
      words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),

    // aLtErNaTe
    alternating: (words) =>
      words.map((w) =>
        [...w.toLowerCase()]
          .map((ch, i) => (i % 2 === 1 ? ch.toUpperCase() : ch))
          .join("")
      ),

    // RaNdOM
    random: (words) =>
      words.map((w) =>
        [...w]
          .map((ch) =>
            Math.random() < 0.5 ? ch.toUpperCase() : ch.toLowerCase()
          )
          .join("")
      ),
  };

  // Default states
  const state = {
    words: 3,
    delimiter: " ",
    case: "lower",
    wordlist: "eff-special",
    min: 3,
    max: 9,
    advancedOpen: false,
  };

  const MIN_WORDS = 2;
  const MAX_WORDS = 12;
  const RECENT_KEY = "nickgen.recent";
  const RECENT_LIMIT = 6;
  const SETTINGS_KEY = "nickgen.settings";

  const wordlistCache = {};
  let lastWords = null;

  async function fetchRealList(id) {
    if (wordlistCache[id]) return wordlistCache[id];
    const meta = catalogById[id];
    const res = await fetch(meta.file);
    if (!res.ok) throw new Error(`Failed to load ${meta.file} (${res.status})`);
    const text = await res.text();
    const words = text.split("\n").map((w) => w.trim()).filter(Boolean);
    wordlistCache[id] = words;
    meta.count = words.length;
    return words;
  }

  async function getWordlist(id) {
    if (id !== "all") return fetchRealList(id);
    if (wordlistCache.all) return wordlistCache.all;

    const lists = await Promise.all(REAL_WORDLIST_IDS.map(fetchRealList));
    const merged = new Set();
    for (const list of lists) for (const w of list) merged.add(w);
    const all = Array.from(merged);
    wordlistCache.all = all;
    catalogById.all.count = all.length;
    return all;
  }

  // localStorage
  function loadSettings() {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== "object") return;

    if (Number.isInteger(raw.words)) {
      state.words = Math.max(MIN_WORDS, Math.min(MAX_WORDS, raw.words));
    }
    if (typeof raw.delimiter === "string" && raw.delimiter.length <= 6) {
      state.delimiter = raw.delimiter;
    }
    if (typeof raw.case === "string" && CASE_METHODS[raw.case]) {
      state.case = raw.case;
    }
    if (typeof raw.wordlist === "string" && catalogById[raw.wordlist]) {
      state.wordlist = raw.wordlist;
    }
    if (Number.isInteger(raw.min)) {
      state.min = Math.max(1, Math.min(25, raw.min));
    }
    if (Number.isInteger(raw.max)) {
      state.max = Math.max(1, Math.min(25, raw.max));
    }
    if (typeof raw.advancedOpen === "boolean") {
      state.advancedOpen = raw.advancedOpen;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          words: state.words,
          delimiter: state.delimiter,
          case: state.case,
          wordlist: state.wordlist,
          min: state.min,
          max: state.max,
          advancedOpen: state.advancedOpen,
        })
      );
    } catch {
      // storage unavailable - ignore
    }
  }

  // DOM refs
  const $ = (sel) => document.querySelector(sel);

  const wordsValueEl = $("#words-value");
  const wordsDecBtn = $("#words-dec");
  const wordsIncBtn = $("#words-inc");

  const delimiterRow = $("#delimiter-row");
  const caseRow = $("#case-row");

  const advancedToggle = $("#advanced-toggle");
  const advancedPanel = $("#advanced-panel");
  const wordlistSelect = $("#wordlist-select");
  const wordlistDesc = $("#wordlist-desc");
  const minLenInput = $("#min-len");
  const maxLenInput = $("#max-len");

  const nicknameField = $("#nickname-field");
  const nicknameText = $("#nickname-text");
  const copyBtn = $("#copy-btn");
  const copyIcon = $("#copy-icon");
  const errorMsg = $("#error-msg");
  const generateBtn = $("#generate-btn");
  const recentList = $("#recent-list");

  // Wordlist select
  function populateWordlistSelect() {
    wordlistSelect.innerHTML = "";
    const orderedIds = ["all", ...REAL_WORDLIST_IDS];
    for (const id of orderedIds) {
      const wl = catalogById[id];
      if (!wl) continue;
      const opt = document.createElement("option");
      opt.value = wl.id;
      opt.textContent = wl.count ? `${wl.label} (${wl.count.toLocaleString("ru-RU")})` : wl.label;
      if (wl.id === state.wordlist) opt.selected = true;
      wordlistSelect.appendChild(opt);
    }
    updateWordlistDesc();
  }

  function updateWordlistDesc() {
    wordlistDesc.textContent = catalogById[state.wordlist]?.description || "";
  }

  wordlistSelect.addEventListener("change", () => {
    state.wordlist = wordlistSelect.value;
    updateWordlistDesc();
    saveSettings();
  });

  // Word count stepper
  function setWords(n) {
    state.words = Math.max(MIN_WORDS, Math.min(MAX_WORDS, n));
    wordsValueEl.textContent = String(state.words);
    wordsDecBtn.disabled = state.words <= MIN_WORDS;
    wordsIncBtn.disabled = state.words >= MAX_WORDS;
    saveSettings();
  }

  wordsDecBtn.addEventListener("click", () => setWords(state.words - 1));
  wordsIncBtn.addEventListener("click", () => setWords(state.words + 1));

  // Chip groups (delimiter / case)
  function wireChipRow(row, onSelect) {
    row.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      row.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      btn.classList.add("is-active");
      onSelect(btn.dataset.value);
    });
  }

  wireChipRow(delimiterRow, (value) => {
    state.delimiter = value;
    saveSettings();
    applyLiveFormatting();
  });

  wireChipRow(caseRow, (value) => {
    state.case = value;
    saveSettings();
    applyLiveFormatting({ recase: true });
  });

  function syncChipHighlight(row, value) {
    row.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.value === value);
    });
  }

  // Advanced settings
  function setAdvancedOpen(open) {
    state.advancedOpen = open;
    advancedToggle.setAttribute("aria-expanded", String(open));
    advancedPanel.hidden = !open;
  }

  advancedToggle.addEventListener("click", () => {
    const isOpen = advancedToggle.getAttribute("aria-expanded") === "true";
    setAdvancedOpen(!isOpen);
    saveSettings();
  });

  minLenInput.addEventListener("change", () => {
    state.min = clampInt(minLenInput.value, 1, 25, state.min);
    minLenInput.value = state.min;
    saveSettings();
  });

  maxLenInput.addEventListener("change", () => {
    state.max = clampInt(maxLenInput.value, 1, 25, state.max);
    maxLenInput.value = state.max;
    saveSettings();
  });

  function clampInt(raw, low, high, fallback) {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(low, Math.min(high, n));
  }

  // Nickname field
  function setNicknameText(nickname) {
    nicknameText.textContent = nickname;
  }

  function animateToNickname(nickname) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setNicknameText(nickname);
      return;
    }

    nicknameField.classList.remove("is-flipping");
    void nicknameField.offsetWidth; // restart animation
    nicknameField.classList.add("is-flipping");

    window.setTimeout(() => {
      setNicknameText(nickname);
    }, 90); // swap text at the midpoint of the flip animation
  }

  function applyLiveFormatting({ recase = false } = {}) {
    if (!lastWords) return;

    if (recase) {
      lastWords = CASE_METHODS[state.case](lastWords);
    }

    const nickname = lastWords.join(state.delimiter);
    setNicknameText(nickname);
  }

  // Copy to clipboard
  copyBtn.addEventListener("click", async () => {
    const text = nicknameText.textContent.trim();
    if (!text || text === "\u2014") return;
    try {
      await navigator.clipboard.writeText(text);
      copyIcon.textContent = "\u2705";
      copyBtn.classList.add("is-copied");
      window.setTimeout(() => {
        copyIcon.textContent = "\u{1F4CB}";
        copyBtn.classList.remove("is-copied");
      }, 1200);
    } catch {
      // clipboard blocked
    }
  });

  // Recent history (localStorage)
  function loadRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveRecent(list) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      // storage unavailable
    }
  }

  function pushRecent(nickname) {
    let list = loadRecent().filter((n) => n !== nickname);
    list.unshift(nickname);
    list = list.slice(0, RECENT_LIMIT);
    saveRecent(list);
    renderRecent(list);
  }

  function renderRecent(list) {
    recentList.innerHTML = "";
    if (list.length === 0) {
      recentList.parentElement.hidden = true;
      return;
    }
    recentList.parentElement.hidden = false;
    for (const nickname of list) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "recent-chip";
      chip.textContent = nickname;
      chip.title = "Show in field";
      chip.addEventListener("click", () => {
        animateToNickname(nickname);
      });
      recentList.appendChild(chip);
    }
  }

  // Generation
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  function clearError() {
    errorMsg.hidden = true;
    errorMsg.textContent = "";
  }

  function pickWords(pool, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out;
  }

  async function generate() {
    clearError();
    generateBtn.classList.add("is-loading");
    generateBtn.disabled = true;

    try {
      const fullList = await getWordlist(state.wordlist);
      const min = Math.min(state.min, state.max);
      const max = Math.max(state.min, state.max);
      const pool = fullList.filter((w) => w.length >= min && w.length <= max);

      if (pool.length < 2) {
        showError(
          `There are no words between ${min} and ${max} letters. Expand the range in the advanced settings.`
        );
        return;
      }

      const rawWords = pickWords(pool, state.words);
      const words = CASE_METHODS[state.case](rawWords);
      lastWords = words;
      const nickname = words.join(state.delimiter);

      animateToNickname(nickname);
      pushRecent(nickname);
    } catch (err) {
      showError(err.message || "Something went wrong when loading the wordlist.");
    } finally {
      window.setTimeout(() => {
        generateBtn.classList.remove("is-loading");
        generateBtn.disabled = false;
      }, 250);
    }
  }

  generateBtn.addEventListener("click", generate);

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    if (typing) return;
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      generate();
    }
  });

  // Init
  async function init() {
    let catalog, ids;
    try {
      ({ catalog, ids } = await loadManifest());
    } catch (err) {
      showError(err.message || "Failed to load the wordlist catalog (data/manifest.json).");
      return;
    }

    catalogById = catalog;
    REAL_WORDLIST_IDS = ids;
    catalogById.all = {
      id: "all",
      label: "All wordlists",
      description: "The words from all wordlists.",
      count: null,
    };

    loadSettings();

    if (!catalogById[state.wordlist]) {
      state.wordlist = "all";
      saveSettings();
    }

    try {
      await getWordlist("all");
    } catch (err) {
      // non-fatal
    }

    populateWordlistSelect();
    setWords(state.words);
    syncChipHighlight(delimiterRow, state.delimiter);
    syncChipHighlight(caseRow, state.case);
    minLenInput.value = state.min;
    maxLenInput.value = state.max;
    setAdvancedOpen(state.advancedOpen);
    renderRecent(loadRecent());
    generate();
  }

  init();
})();
