/* chapters.js — the gnome-led, multi-page onboarding sequencer.
 *
 * Each chapter is a standalone page that loads the REAL GIMS bundle + the mock + the tour engine.
 * This script: (1) paints the DEMO banner, (2) finds the current chapter by body[data-page],
 * (3) waits for the page to be ready, (4) runs that chapter's tour, and (5) on finish navigates to
 * the next chapter. Progress is the page you're on; the mock store carries data between chapters.
 *
 * Steps drive the real controls with a React-correct value setter (native setter + input/change)
 * so the gnome can fill forms the way a user would. Selectors are functions so they re-resolve as
 * React re-renders.
 */
(function () {
  "use strict";

  var NARRATOR = { image: "/static/images/gnome-tour.png", name: "GIMS Gnome" };
  var THEME = { dim: "rgba(3, 12, 9, 0.78)", ring: "#2dd4bf" };

  // ── tiny DOM helpers (React-aware) ─────────────────────────────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function setReactValue(el, value) {
    if (!el) return;
    var proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype
              : el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function clickEl(elOrSel) {
    var el = typeof elOrSel === "string" ? $(elOrSel) : elOrSel;
    if (el) el.click();
    return el;
  }
  function byText(sel, text) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      if ((els[i].textContent || "").trim().toLowerCase().indexOf(text.toLowerCase()) !== -1) return els[i];
    }
    return null;
  }
  function optionExists(sel, value) {
    if (!sel) return false;
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === value) return true;
    return false;
  }
  function waitFor(fn, timeout) {
    timeout = timeout || 6000;
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        var v;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(poll, 80);
      })();
    });
  }

  // ── noun_configure chapter selectors ──────────────────────────────────────────────────────────
  function ncProj() { return document.querySelectorAll(".nc-toolbar .nc-select")[0]; }
  function ncNoun() { return document.querySelectorAll(".nc-toolbar .nc-select")[1]; }
  function ncLastRow() { var r = document.querySelectorAll(".nc-table tbody tr"); return r[r.length - 1]; }
  function ncSaveBtn() { return byText(".nc-actions button", "Save Changes"); }

  function addFieldRow(name, type) {
    return (async function () {
      clickEl(byText(".nc-actions button", "New Field"));
      await waitFor(function () { var r = ncLastRow(); return r && r.querySelector("input.nc-input"); });
      var row = ncLastRow();
      setReactValue(row.querySelector("input.nc-input"), name);
      setReactValue(row.querySelector("select.nc-select"), type);
    })();
  }

  var NOUN_STEPS = [
    { target: null, placement: "center", title: "Define a noun 🧙",
      html: "GIMS models your lab as a <b>grammar</b>. A <b>noun</b> is a kind of record — a Sample, a Batch. " +
            "Let's give a <b>Sample</b> two date fields so we can time it later." },
    { target: ncProj, placement: "bottom", title: "1 · Pick the project",
      html: "Everything is scoped to a project. I'll choose <b>Demo Lab</b>.",
      beforeShow: async function () { await waitFor(function () { return optionExists(ncProj(), "Demo Lab"); }); setReactValue(ncProj(), "Demo Lab"); } },
    { target: ncNoun, placement: "bottom", title: "2 · Pick the noun",
      html: "And the <b>Sample</b> noun.",
      beforeShow: async function () { await waitFor(function () { return optionExists(ncNoun(), "Sample"); }); setReactValue(ncNoun(), "Sample"); } },
    { target: 'input[name="action"][value="edit"]', placement: "bottom", title: "3 · Switch to Edit",
      html: "<b>View</b> shows the schema as JSON; <b>Edit</b> lets us change it.",
      beforeShow: async function () { clickEl('input[name="action"][value="edit"]'); await waitFor(function () { return $(".nc-table"); }); } },
    { target: ".nc-table", placement: "top", title: "The fields",
      html: "Here are the Sample's fields — right now just <b>sample_id</b>. Let's add when it arrived and when it's due." },
    { target: ncLastRow, placement: "top", title: "4 · Add received_at",
      html: "I'll add <b>received_at</b>, type <b>datetime</b> — a date <i>with</i> a time of day.",
      beforeShow: function () { return addFieldRow("received_at", "datetime"); } },
    { target: ncLastRow, placement: "top", title: "5 · Add due_at",
      html: "And <b>due_at</b>, also <b>datetime</b> — the deadline.",
      beforeShow: function () { return addFieldRow("due_at", "datetime"); } },
    { target: ncLastRow, placement: "top", title: "6 · Add hold_clock",
      html: "One more: a <b>hold_clock</b> field. In the next chapter we'll turn it into a <b>live timer</b> that ticks between the two dates.",
      beforeShow: function () { return addFieldRow("hold_clock", "string"); } },
    { target: ncSaveBtn, placement: "top", title: "7 · Save the schema",
      html: "Click <b>Save Changes</b> to write the new fields.",
      advanceOn: "target-click", advanceDelay: 700 },
    { target: null, placement: "center", title: "Noun ready ✅",
      html: "Sample now has <b>received_at</b>, <b>due_at</b> and <b>hold_clock</b>. Next: a time-aware <b>adjective</b> that makes the clock tick." },
  ];

  // ── adjective_editor chapter ──────────────────────────────────────────────────────────────────
  function aeProj() { return document.getElementById("project"); }
  function aeNoun() { return document.getElementById("noun"); }
  function aeRegRow(name) {
    var rows = document.querySelectorAll(".ae-register-row");
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i].querySelector(".ae-register-field");
      if (f && f.textContent.trim() === name) return rows[i];
    }
    return null;
  }
  function aeDurSelects() { return document.querySelectorAll(".ae-detail-body select"); }
  function aeSaveBtn() { return byText(".ae-detail-actions button", "Save"); }

  var ADJ_STEPS = [
    { target: null, placement: "center", title: "Describe the noun 🧙",
      html: "An <b>adjective</b> describes a noun. We'll turn <b>hold_clock</b> into a live <b>Duration</b> timer that counts between <b>received_at</b> and <b>due_at</b>." },
    { target: aeProj, placement: "bottom", title: "1 · Project",
      html: "Same <b>Demo Lab</b> project.",
      beforeShow: async function () { await waitFor(function () { return optionExists(aeProj(), "Demo Lab"); }); setReactValue(aeProj(), "Demo Lab"); } },
    { target: aeNoun, placement: "bottom", title: "2 · Noun",
      html: "On the <b>Sample</b> noun.",
      beforeShow: async function () { await waitFor(function () { return optionExists(aeNoun(), "Sample"); }); setReactValue(aeNoun(), "Sample"); } },
    { target: function () { return aeRegRow("hold_clock"); }, placement: "top", title: "3 · Make it a Duration",
      html: "In <b>Register new adjective</b>, I'll set <b>hold_clock</b>'s class to <b>Duration</b>.",
      beforeShow: async function () { await waitFor(function () { return aeRegRow("hold_clock"); }); setReactValue(aeRegRow("hold_clock").querySelector(".ae-register-class"), "Duration"); } },
    { target: function () { var r = aeRegRow("hold_clock"); return r && r.querySelector("button"); }, placement: "left", title: "4 · Register",
      html: "Click <b>Register</b> to promote it to an adjective.",
      advanceOn: "target-click", advanceDelay: 800 },
    { target: function () { return aeDurSelects()[0]; }, placement: "right", title: "5 · Start = received_at",
      html: "Now configure the clock. The <b>start</b> anchor — when it arrived: <b>received_at</b>.",
      beforeShow: async function () { await waitFor(function () { return aeDurSelects().length >= 2; }); setReactValue(aeDurSelects()[0], "received_at"); } },
    { target: function () { return aeDurSelects()[1]; }, placement: "right", title: "6 · End = due_at",
      html: "The <b>end</b> anchor — the deadline: <b>due_at</b>.",
      beforeShow: function () { setReactValue(aeDurSelects()[1], "due_at"); } },
    { target: function () { return aeDurSelects()[2]; }, placement: "right", title: "7 · Show both",
      html: "<b>Mode</b>: show both <i>elapsed</i> and <i>remaining</i> (“3h in · 2d left”).",
      beforeShow: function () { setReactValue(aeDurSelects()[2], "both"); } },
    { target: aeSaveBtn, placement: "top", title: "8 · Save the binding",
      html: "Save it.",
      advanceOn: "target-click", advanceDelay: 800 },
    { target: null, placement: "center", title: "Live clock wired ✅",
      html: "<b>hold_clock</b> now ticks from <b>received_at</b> to <b>due_at</b>. Next: a <b>verb</b> — an action you run on a Sample." },
  ];

  // ── chapter registry (steps for later chapters are added as those pages are built) ──────────────
  var CHAPTERS = [
    { id: "welcome", page: "welcome",          url: "/index.html",                  label: "Welcome" },
    { id: "noun",    page: "noun_configure",   url: "/pages/noun_configure.html",   label: "Noun",      ready: ".nc-toolbar .nc-select", steps: NOUN_STEPS },
    { id: "adj",     page: "adjective_editor", url: "/pages/adjective_editor.html", label: "Adjective", ready: "#project", steps: ADJ_STEPS },
    { id: "verb",    page: "verb_editor",      url: "/pages/verb_editor.html",      label: "Verb" },
    { id: "enter",   page: "noun_workbench",   url: "/pages/noun_workbench.html",   label: "Enter data" },
    { id: "runlog",  page: "runlog_workbench", url: "/pages/runlog_workbench.html", label: "Runlog" },
  ];
  // exposed so per-page chapter scripts can register their STEPS before the runner starts
  window.GimsChapters = { list: CHAPTERS, helpers: { setReactValue: setReactValue, clickEl: clickEl, byText: byText, optionExists: optionExists, waitFor: waitFor, $: $ } };

  function chapterIndex(page) { for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].page === page) return i; return -1; }

  // ── DEMO banner ────────────────────────────────────────────────────────────────────────────────
  function paintBanner(idx) {
    if (document.querySelector(".demo-banner")) return;
    var n = CHAPTERS.length - 1; // exclude welcome from the count
    var pos = idx <= 0 ? "Intro" : "Chapter " + idx + " of " + n;
    var bar = document.createElement("div");
    bar.className = "demo-banner";
    bar.innerHTML =
      '<span class="demo-dot"></span>' +
      '<span class="demo-text"><b>DEMO</b> — simulated, no backend, resets when you close the tab. Any login works. Not for regulated use.</span>' +
      '<span class="demo-grow"></span>' +
      '<span class="demo-chip">' + pos + '</span>' +
      '<button type="button" class="demo-btn" id="demoReplay" title="Replay this chapter">↻ Replay</button>' +
      '<button type="button" class="demo-btn" id="demoReset" title="Wipe demo data and start over">⟲ Reset</button>';
    document.body.appendChild(bar);
    var rep = document.getElementById("demoReplay");
    if (rep) rep.addEventListener("click", function () { startTour(CHAPTERS[idx]); });
    var rst = document.getElementById("demoReset");
    if (rst) rst.addEventListener("click", function () { if (window.GimsMock) window.GimsMock.reset(); location.href = "/index.html"; });
  }

  // ── tour driver ──────────────────────────────────────────────────────────────────────────────
  function startTour(ch) {
    if (!ch || !ch.steps || !window.Tour) return;
    var idx = CHAPTERS.indexOf(ch);
    var isLast = idx === CHAPTERS.length - 1;
    window.Tour.start({
      storageKey: null,
      narrator: NARRATOR, dim: THEME.dim, ring: THEME.ring,
      finishLabel: isLast ? "Finish 🎉" : "Next chapter →",
      steps: ch.steps,
      onFinish: function () { if (!isLast) location.href = CHAPTERS[idx + 1].url; },
      onSkip: function () { /* stay on the page so the visitor can explore freely */ },
    });
  }

  function boot() {
    var page = document.body.dataset.page || "welcome";
    var idx = chapterIndex(page);
    paintBanner(idx);
    var ch = CHAPTERS[idx];
    if (ch && ch.steps) {
      // wait for the React page to be ready, then let the gnome take over
      (ch.ready ? waitFor(function () { return $(ch.ready); }, 8000) : Promise.resolve(true))
        .then(function () { setTimeout(function () { startTour(ch); }, 350); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
