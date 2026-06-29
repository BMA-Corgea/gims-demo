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
      beforeShow: async function () { var row = await waitFor(function () { return aeRegRow("hold_clock"); }); var sel = row && row.querySelector(".ae-register-class"); if (sel) setReactValue(sel, "Duration"); } },
    { target: function () { return $(".ae-detail-panel") || $(".ae-detail"); }, placement: "left", title: "4 · Register it",
      html: "I'll click <b>Register</b> — <b>hold_clock</b> becomes a Duration adjective and its clock config opens here.",
      beforeShow: async function () {
        var r = aeRegRow("hold_clock"), b = r && r.querySelector("button");
        if (b) b.click();
        await waitFor(function () { return aeDurSelects().length >= 2; }, 8000);
      } },
    { target: function () { return aeDurSelects()[0]; }, placement: "right", title: "5 · Start = received_at",
      html: "The <b>start</b> anchor — when it arrived: <b>received_at</b>.",
      beforeShow: async function () { await waitFor(function () { return aeDurSelects().length >= 2; }); setReactValue(aeDurSelects()[0], "received_at"); } },
    { target: function () { return aeDurSelects()[1]; }, placement: "right", title: "6 · End = due_at",
      html: "The <b>end</b> anchor — the deadline: <b>due_at</b>.",
      beforeShow: function () { setReactValue(aeDurSelects()[1], "due_at"); } },
    { target: function () { return aeDurSelects()[2]; }, placement: "right", title: "7 · Show both",
      html: "<b>Mode</b>: show both <i>elapsed</i> and <i>remaining</i> (“3h in · 2d left”).",
      beforeShow: function () { setReactValue(aeDurSelects()[2], "both"); } },
    { target: aeSaveBtn, placement: "top", title: "8 · Save the binding",
      html: "And I'll <b>Save</b> the binding.",
      beforeShow: function () { var b = aeSaveBtn(); if (b) b.click(); } },
    { target: null, placement: "center", title: "Live clock wired ✅",
      html: "<b>hold_clock</b> now ticks from <b>received_at</b> to <b>due_at</b>. Next: a <b>verb</b> — an action you run on a Sample." },
  ];

  // ── chapter registry (steps for later chapters are added as those pages are built) ──────────────
  // Ensure the Adjective chapter works even if you jump straight to it: the Sample noun needs the
  // two datetime fields + a hold_clock field (normally added in the Noun chapter).
  function ensureSampleFields() {
    if (!window.GimsMock) return;
    var s = window.GimsMock.store(), f = s.nouns["Demo Lab"] && s.nouns["Demo Lab"].Sample && s.nouns["Demo Lab"].Sample.fields;
    if (!f) return;
    if (!f.received_at) f.received_at = { type: "datetime", required: true };
    if (!f.due_at)      f.due_at = { type: "datetime", required: true };
    // hold_clock must start as a PLAIN field so the Register flow works on REPLAY — a prior run of
    // this chapter may have already promoted it to a Duration adjective (so it'd be gone from the
    // "Register new adjective" list). Reset it.
    f.hold_clock = { type: "string", required: true };
    if (s.adjectives["Demo Lab"]) delete s.adjectives["Demo Lab"].hold_clock;
    window.GimsMock.save();
  }

  var CHAPTERS = [
    { id: "welcome", page: "welcome",          url: "/index.html",                  label: "Welcome",    built: true,
      desc: "The parts-of-speech idea + how the demo works" },
    { id: "noun",    page: "noun_configure",   url: "/pages/noun_configure.html",   label: "Noun",       built: true, ready: ".nc-toolbar .nc-select", steps: NOUN_STEPS,
      desc: "Define a Sample record type and give it date fields" },
    { id: "adj",     page: "adjective_editor", url: "/pages/adjective_editor.html", label: "Adjective",  built: true, ready: "#project", steps: ADJ_STEPS, setup: ensureSampleFields,
      desc: "Turn hold_clock into a live Duration timer" },
    { id: "verb",    page: "verb_editor",      url: "/pages/verb_editor.html",      label: "Verb",       built: false,
      desc: "Define a Test — an action you run on a Sample" },
    { id: "enter",   page: "noun_workbench",   url: "/pages/noun_workbench.html",   label: "Enter data", built: false,
      desc: "Create a real Sample record in the grid" },
    { id: "runlog",  page: "runlog_workbench", url: "/pages/runlog_workbench.html", label: "Runlog",     built: false,
      desc: "Watch the clock tick + the NTP clock badge" },
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
      '<button type="button" class="demo-chip demo-chip-btn" id="demoChip" title="Jump to a chapter">' + pos + ' ▾</button>' +
      '<button type="button" class="demo-btn" id="demoReplay" title="Replay this chapter">↻ Replay</button>' +
      '<button type="button" class="demo-btn" id="demoReset" title="Wipe demo data and start over">⟲ Reset</button>';
    document.body.appendChild(bar);

    // chapter picker dropdown
    var menu = buildChapterMenu(idx);
    document.body.appendChild(menu);
    var chip = document.getElementById("demoChip");
    chip.addEventListener("click", function (e) {
      e.stopPropagation();
      var r = chip.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 312)) + "px";
      menu.style.top = (r.bottom + 6) + "px";
      menu.classList.toggle("open");
    });
    document.addEventListener("click", function (e) { if (!menu.contains(e.target) && e.target !== chip) menu.classList.remove("open"); });

    var rep = document.getElementById("demoReplay");
    if (rep) rep.addEventListener("click", function () { startTour(CHAPTERS[idx]); });
    var rst = document.getElementById("demoReset");
    if (rst) rst.addEventListener("click", function () { if (window.GimsMock) window.GimsMock.reset(); location.href = "/index.html"; });
  }

  function buildChapterMenu(curIdx) {
    var menu = document.createElement("div");
    menu.className = "demo-menu";
    menu.innerHTML = '<div class="demo-menu-head">Jump to a chapter</div>';
    CHAPTERS.forEach(function (ch, i) {
      var num = i === 0 ? "✦" : String(i);
      var tag = ch.built ? "a" : "div";
      var cls = "demo-menu-item" + (i === curIdx ? " current" : "") + (ch.built ? "" : " disabled");
      var item = document.createElement(tag);
      item.className = cls;
      if (ch.built) item.href = ch.url;
      item.innerHTML =
        '<span class="demo-menu-num">' + num + '</span>' +
        '<span class="demo-menu-body">' +
          '<span class="demo-menu-name">' + ch.label + (ch.built ? '' : ' <em>· coming soon</em>') + '</span>' +
          '<span class="demo-menu-desc">' + ch.desc + '</span>' +
        '</span>';
      menu.appendChild(item);
    });
    return menu;
  }

  // ── tour driver ──────────────────────────────────────────────────────────────────────────────
  function startTour(ch) {
    if (!ch || !ch.steps || !window.Tour) return;
    var idx = CHAPTERS.indexOf(ch);
    var nxt = CHAPTERS[idx + 1];
    var hasNext = !!(nxt && nxt.built);   // only advance to a chapter that actually exists
    window.Tour.start({
      storageKey: null,
      narrator: NARRATOR, dim: THEME.dim, ring: THEME.ring,
      finishLabel: hasNext ? "Next chapter →" : "Finish 🎉",
      steps: ch.steps,
      onFinish: function () { if (hasNext) location.href = nxt.url; },
      onSkip: function () { /* stay on the page so the visitor can explore freely */ },
    });
  }

  function boot() {
    var page = document.body.dataset.page || "welcome";
    var idx = chapterIndex(page);
    paintBanner(idx);
    var ch = CHAPTERS[idx];
    if (ch && ch.setup) { try { ch.setup(); } catch (e) {} }   // seed any prerequisites for this chapter
    if (ch && ch.steps) {
      // wait for the React page to be ready, then let the gnome take over
      (ch.ready ? waitFor(function () { return $(ch.ready); }, 8000) : Promise.resolve(true))
        .then(function () { setTimeout(function () { startTour(ch); }, 350); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
