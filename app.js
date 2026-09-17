"use strict";

/* ============================ state ============================ */
const STORE_KEY = "qwen-test-hub.notes.v1";
const PREF_KEY  = "qwen-test-hub.prefs.v1";
const APP = { name: "Notes", version: "1.1" };

let notes = [];
let prefs = { theme: "auto", longNotes: "clamp" };
let activeTag = null;
let filter = "all";
let expanded = new Set();
let deferredInstall = null;

const $ = (id) => document.getElementById(id);
const input = $("input"), listEl = $("list"), emptyEl = $("empty"),
      searchEl = $("search"), chipsEl = $("chips"), toastEl = $("toast");

/* ============================ storage ============================ */
function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function load() {
  const raw = readJSON(STORE_KEY, null);
  notes = Array.isArray(raw) ? raw.filter(isNote) : [];
  const p = readJSON(PREF_KEY, null);
  if (p && typeof p === "object") prefs = Object.assign(prefs, p);
}
function isNote(n) {
  return n && typeof n === "object" && typeof n.text === "string" && typeof n.id === "string";
}
let saveTimer = null, flashTimer = null;
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(notes));
    toast("Saved");
  } catch (e) {
    toast("Could not save — private browsing or storage full?");
  }
  renderStat();
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => toastEl.classList.remove("show"), 1300);
}

/* ============================ helpers ============================ */
const TAG_RE = /#([\p{L}\p{N}][\w-]*)/gu;

function tagsOf(n) {
  const inline = (n.text.match(TAG_RE) || []).map((s) => s.slice(1).toLowerCase());
  const explicit = Array.isArray(n.tags) ? n.tags.map((t) => String(t).toLowerCase()) : [];
  return [...new Set([...explicit, ...inline])];
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function highlight(text, q) {
  if (!q) return esc(text);
  const lower = text.toLowerCase(), needle = q.toLowerCase();
  let out = "", from = 0, i;
  while ((i = lower.indexOf(needle, from)) !== -1) {
    out += esc(text.slice(from, i)) + "<mark>" + esc(text.slice(i, i + needle.length)) + "</mark>";
    from = i + needle.length;
  }
  return out + esc(text.slice(from));
}
function relTime(iso) {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return min + "m ago";
  const hr = Math.round(min / 60);
  if (hr < 24) return hr + "h ago";
  const d = new Date(iso), now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return "Today " + time;
  if (d.toDateString() === yest.toDateString()) return "Yesterday " + time;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" }) + " · " + time;
}
function newId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
function download(name, text, mime) {
  mime = mime || "text/plain;charset=utf-8";
  const a = document.createElement("a");
  a.download = name;
  let url = null;
  try {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      url = URL.createObjectURL(new Blob([text], { type: mime }));
    }
  } catch (e) { url = null; }
  if (!url) {
    // Fallback for environments without object URLs: inline as a data URI.
    try { url = "data:" + mime + ";base64," + btoa(unescape(encodeURIComponent(text))); }
    catch (e2) {
      window.alert("Could not start the download in this browser.\n\nYour notes are safe — they are still stored here.");
      return false;
    }
  }
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (url.startsWith("blob:")) {
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
  }
  return true;
}
const today = () => new Date().toISOString().slice(0, 10);

/* ============================ theme ============================ */
const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function applyTheme() {
  const dark = prefs.theme === "dark" || (prefs.theme === "auto" && mq && mq.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#141517" : "#2f6f4f");
}
function cycleTheme() {
  prefs.theme = prefs.theme === "auto" ? "light" : prefs.theme === "light" ? "dark" : "auto";
  savePrefs(); applyTheme();
  toast("Theme: " + prefs.theme);
}
if (mq && mq.addEventListener) mq.addEventListener("change", applyTheme);

/* ============================ actions ============================ */
function addNote() {
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  notes.unshift({ id: newId(), text: text, tags: [], created: new Date().toISOString(), pinned: false });
  input.value = "";
  updateCharCount();
  save(); render(); input.focus();
}
function findNote(id) { return notes.find((n) => n.id === id); }
function togglePin(id) {
  const n = findNote(id); if (!n) return;
  n.pinned = !n.pinned;
  save(); render();
  toast(n.pinned ? "Pinned" : "Unpinned");
}
function editNote(id) {
  const n = findNote(id); if (!n) return;
  const next = window.prompt("Edit note:", n.text);
  if (next === null) return;
  if (!next.trim()) { deleteNote(id, true); return; }
  n.text = next.trim();
  n.edited = new Date().toISOString();
  save(); render();
  toast("Note updated");
}
function deleteNote(id, skipConfirm) {
  const n = findNote(id); if (!n) return;
  const preview = n.text.length > 70 ? n.text.slice(0, 70) + "…" : n.text;
  if (!skipConfirm && !window.confirm("Delete this note?\n\n" + preview)) return;
  notes = notes.filter((x) => x.id !== id);
  expanded.delete(id);
  save(); render();
  toast("Note deleted");
}
function toggleTag(tag) {
  activeTag = (activeTag === tag) ? null : tag;
  render();
}
function setFilter(f) {
  filter = f;
  [...$("filterSeg").children].forEach((b) => b.classList.toggle("on", b.dataset.filter === f));
  render();
}
function clearAllFilters() {
  searchEl.value = ""; activeTag = null; filter = "all";
  setFilter("all");
}

/* ============================ export / import ============================ */
function exportJSON() {
  const okDl = download("notes-backup-" + today() + ".json",
    JSON.stringify({ app: "qwen-test-hub-notes", version: 1,
                     exported: new Date().toISOString(), count: notes.length, notes: notes }, null, 2),
    "application/json");
  if (okDl !== false) toast("Backup downloaded");
}
function exportMarkdown() {
  const lines = ["# Notes", "", "Exported " + new Date().toLocaleString() + " · " + notes.length + " note(s)", ""];
  const sorted = [...notes].sort((a, b) => new Date(b.created) - new Date(a.created));
  for (const n of sorted) {
    const tg = tagsOf(n);
    lines.push("## " + n.text.split("\n")[0].slice(0, 80));
    lines.push("");
    lines.push("*" + relTime(n.created) + (tg.length ? " · " + tg.map((t) => "`#" + t + "`").join(" ") : "") + "*");
    lines.push("");
    const rest = n.text.split("\n").slice(1).join("\n").trim();
    lines.push(rest || n.text.trim());
    lines.push("");
  }
  const okMd = download("notes-" + today() + ".md", lines.join("\n"), "text/markdown;charset=utf-8");
  if (okMd !== false) toast("Markdown exported");
}
function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let incoming;
    try {
      const parsed = JSON.parse(reader.result);
      incoming = Array.isArray(parsed) ? parsed : parsed && parsed.notes;
      if (!Array.isArray(incoming)) throw new Error("no notes found in that file");
    } catch (e) {
      window.alert("That file doesn't look like a Notes backup.\n\n" + e.message);
      return;
    }
    const have = new Set(notes.map((n) => n.id));
    const texts = new Set(notes.map((n) => n.text));
    let added = 0;
    for (const n of incoming) {
      if (!n || typeof n.text !== "string" || !n.text.trim()) continue;
      const id = typeof n.id === "string" ? n.id : newId();
      if (have.has(id) || texts.has(n.text)) continue;
      notes.push({ id: id, text: n.text, tags: Array.isArray(n.tags) ? n.tags : [],
                   created: n.created || new Date().toISOString(),
                   pinned: !!n.pinned, edited: n.edited || undefined });
      added++;
    }
    notes.sort(sortNotes);
    save(); render();
    toast(added ? "Restored " + added + " note" + (added === 1 ? "" : "s") : "Nothing new to restore");
  };
  reader.onerror = () => window.alert("Could not read that file.");
  reader.readAsText(file);
}

/* ============================ sorting / filtering ============================ */
function sortNotes(a, b) {
  if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
  return new Date(b.created) - new Date(a.created);
}
function visibleNotes() {
  const q = searchEl.value.trim().toLowerCase();
  return notes.filter((n) => {
    const tg = tagsOf(n);
    if (activeTag && !tg.includes(activeTag)) return false;
    if (filter === "pinned" && !n.pinned) return false;
    if (filter === "tagged" && tg.length === 0) return false;
    if (q && !(n.text.toLowerCase().includes(q) || tg.join(" ").includes(q))) return false;
    return true;
  });
}

/* ============================ render ============================ */
const PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 3h6l-1 6 3.2 2.6a1 1 0 0 1-.6 1.7H7.4a1 1 0 0 1-.6-1.7L10 9z"/></svg>';
const EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6.5 17.5 9.5"/></svg>';
const DEL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7 7.5 20h9L17.5 7"/><path d="M10.5 11v5.5M13.5 11v5.5"/></svg>';
const CLAMP_LINES = 10;

function renderChips() {
  const counts = new Map();
  for (const n of notes) for (const t of tagsOf(n)) counts.set(t, (counts.get(t) || 0) + 1);
  const all = [...counts.keys()].sort();
  chipsEl.innerHTML = all.map((t) =>
    '<button class="chip' + (activeTag === t ? " on" : "") + '" data-tag="' + esc(t) + '">' +
    '#' + esc(t) + '<span class="n">' + counts.get(t) + '</span></button>').join("");
  chipsEl.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => toggleTag(b.dataset.tag));
  });
}

function renderList() {
  const q = searchEl.value.trim();
  const shown = visibleNotes().sort(sortNotes);

  listEl.innerHTML = shown.map((n) => {
    const tg = tagsOf(n);
    const tagHtml = tg.map((t) => '<span class="tag">#' + esc(t) + "</span>").join("");
    const lines = n.text.split("\n").length;
    const isOpen = expanded.has(n.id);
    const clamp = prefs.longNotes === "clamp" && lines > CLAMP_LINES && !isOpen;
    return '<li class="note' + (n.pinned ? " pinned" : "") + '" data-id="' + esc(n.id) + '">' +
      '<div class="acts">' +
        '<button data-act="pin" class="' + (n.pinned ? "pinned" : "") + '" title="' + (n.pinned ? "Unpin" : "Pin") + '" aria-label="Pin">' + PIN_SVG + "</button>" +
        '<button data-act="edit" title="Edit" aria-label="Edit">' + EDIT_SVG + "</button>" +
        '<button data-act="del" class="del" title="Delete" aria-label="Delete">' + DEL_SVG + "</button>" +
      "</div>" +
      '<p class="body' + (clamp ? " clamp" : "") + '">' + highlight(n.text, q) + "</p>" +
      (clamp ? '<button class="more" data-act="more">Show more</button>' : "") +
      '<div class="row-meta"><span>' + esc(relTime(n.created)) + "</span>" +
        (n.edited ? '<span class="dot">·</span><span>edited</span>' : "") +
        (tagHtml ? '<span class="dot">·</span>' + tagHtml : "") +
      "</div></li>";
  }).join("");

  listEl.querySelectorAll("li.note").forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('[data-act="pin"]').addEventListener("click", () => togglePin(id));
    li.querySelector('[data-act="edit"]').addEventListener("click", () => editNote(id));
    li.querySelector('[data-act="del"]').addEventListener("click", () => deleteNote(id));
    const more = li.querySelector('[data-act="more"]');
    if (more) more.addEventListener("click", () => { expanded.add(id); renderList(); });
  });

  // empty states
  const filtering = !!(q || activeTag || filter !== "all");
  $("clearSearch").hidden = !q;
  if (shown.length === 0) {
    emptyEl.hidden = false;
    if (notes.length === 0) {
      emptyEl.innerHTML = '<div class="glyph">&#128221;</div><b>No notes yet</b>' +
        "<p>Type something above and press <b>Add note</b>. It saves itself as you go.</p>";
    } else if (filtering) {
      emptyEl.innerHTML = '<div class="glyph">&#128269;</div><b>Nothing matches</b>' +
        "<p>Try a different search, or clear the filters to see all " + notes.length + " note" +
        (notes.length === 1 ? "" : "s") + ".</p>";
    } else {
      emptyEl.innerHTML = '<div class="glyph">&#128221;</div><b>No notes yet</b><p>Add your first one above.</p>';
    }
  } else {
    emptyEl.hidden = true;
  }
}

function renderStat() {
  const shown = visibleNotes().length;
  const pinned = notes.filter((n) => n.pinned).length;
  const filtering = !!(searchEl.value.trim() || activeTag || filter !== "all");
  const parts = [];
  parts.push(filtering
    ? shown + " of " + notes.length + " shown"
    : notes.length + " note" + (notes.length === 1 ? "" : "s"));
  if (pinned) parts.push(pinned + " pinned");
  let chars = 0;
  for (const n of notes) chars += n.text.length;
  if (chars) parts.push(chars.toLocaleString() + " characters");
  $("stat").textContent = parts.join(" · ");
}

function render() { renderChips(); renderList(); renderStat(); }

function updateCharCount() {
  const len = input.value.trim().length;
  const tg = (input.value.match(TAG_RE) || []).map((s) => s.slice(1).toLowerCase());
  const uniq = [...new Set(tg)];
  $("charCount").textContent = len ? len + " character" + (len === 1 ? "" : "s") +
    (uniq.length ? " · #" + uniq.join(" #") : "") : "";
  $("addBtn").disabled = len === 0;
}

/* ============================ settings dialog ============================ */
function openSettings() {
  $("themeSel").value = prefs.theme;
  $("denseSel").value = prefs.longNotes;
  let bytes = 0;
  try { bytes = (localStorage.getItem(STORE_KEY) || "").length; } catch (e) {}
  const kb = (bytes / 1024).toFixed(1);
  $("storageInfo").innerHTML = "<b>" + notes.length + "</b> note" + (notes.length === 1 ? "" : "s") +
    " using about <b>" + kb + " KB</b> of this browser's local storage." +
    (navigator.storage && navigator.storage.persisted
      ? "" : " Clearing browser data will erase them — keep a backup.");
  showModal($("settingsDlg"));
}
function showModal(dlg) {
  try {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  } catch (e) { dlg.setAttribute("open", ""); }
}
function clearEverything() {
  if (!notes.length) { toast("Nothing to delete"); return; }
  if (!window.confirm("Delete ALL " + notes.length + " notes?\n\nThis cannot be undone. Consider downloading a backup first.")) return;
  notes = []; expanded.clear();
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  render(); renderStat();
  $("settingsDlg").close ? $("settingsDlg").close() : $("settingsDlg").removeAttribute("open");
  toast("All notes deleted");
}

/* ============================ PWA ============================ */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  $("install").classList.add("show");
});
$("installYes").addEventListener("click", async () => {
  $("install").classList.remove("show");
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (e) {}
  deferredInstall = null;
});
$("installNo").addEventListener("click", () => $("install").classList.remove("show"));
window.addEventListener("appinstalled", () => {
  $("install").classList.remove("show");
  toast("Installed — find it with your apps");
});
function updateNet() {
  const on = navigator.onLine !== false;
  const el = $("net");
  el.classList.toggle("off", !on);
  el.title = on ? "Online" : "Offline — notes still work";
}

/* ============================ wiring ============================ */
$("addBtn").addEventListener("click", addNote);
$("clearSearch").addEventListener("click", () => { searchEl.value = ""; render(); searchEl.focus(); });
$("exportBtn").addEventListener("click", exportJSON);
$("importBtn").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) importFile(f);
  e.target.value = "";
});
$("exportMd").addEventListener("click", exportMarkdown);
$("clearAll").addEventListener("click", clearEverything);
$("themeBtn").addEventListener("click", cycleTheme);
$("settingsBtn").addEventListener("click", openSettings);
$("aboutBtn").addEventListener("click", () => showModal($("aboutDlg")));
$("themeSel").addEventListener("change", (e) => { prefs.theme = e.target.value; savePrefs(); applyTheme(); });
$("denseSel").addEventListener("change", (e) => { prefs.longNotes = e.target.value; savePrefs(); renderList(); });
document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", () => {
    const dlg = b.closest("dialog");
    if (dlg && dlg.close) dlg.close(); else if (dlg) dlg.removeAttribute("open");
  });
});
$("filterSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-filter]");
  if (b) setFilter(b.dataset.filter);
});
searchEl.addEventListener("input", render);
input.addEventListener("input", updateCharCount);
input.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); addNote(); }
});
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  const typing = tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT";
  if (e.key === "Escape") {
    if (searchEl.value) { searchEl.value = ""; render(); }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); input.focus(); }
  else if (e.key === "/") { e.preventDefault(); searchEl.focus(); }
});
window.addEventListener("storage", (e) => { if (e.key === STORE_KEY) { load(); render(); } });
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);

/* ============================ boot ============================ */
applyTheme();
load();
notes.sort(sortNotes);
updateCharCount();
updateNet();
render();
registerSW();
input.focus();
