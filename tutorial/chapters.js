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
    timeout = timeout || 2500;   // fail fast — a hook that waits forever feels like a freeze
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
      beforeShow: async function () {
        // Reversible: if a forward pass already promoted hold_clock, demote it back so this step has
        // its "Register new adjective" row to point at (otherwise stepping Back here would hang
        // waiting for a row that's gone).
        if (window.GimsMock) {
          var s = window.GimsMock.store(), nf = s.nouns["Demo Lab"].Sample.fields;
          if (nf.hold_clock && nf.hold_clock.type === "adjective") {
            nf.hold_clock = { type: "string", required: true };
            if (s.adjectives["Demo Lab"]) delete s.adjectives["Demo Lab"].hold_clock;
            window.GimsMock.save();
            var rb = document.getElementById("refresh"); if (rb) rb.click();
          }
        }
        var row = await waitFor(function () { return aeRegRow("hold_clock"); }, 3000);
        var sel = row && row.querySelector(".ae-register-class");
        if (sel) setReactValue(sel, "Duration");
      } },
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

  // ── verb_editor chapter ─────────────────────────────────────────────────────────────────────
  function veProj() { return document.getElementById("project"); }
  function veNewVerbBtn() { return byText(".rw-toolbar button, .ve-toolbar button, #verb-editor-root button", "New Verb") || byText("button", "New Verb"); }
  function veName() { return document.querySelector("#verb-editor input.input"); }
  function veNewGroup() { return document.querySelector('#verb-editor input[placeholder="Enter new group name"]'); }
  function veNounRef() { return document.getElementById("noun-ref"); }
  function veSave() { return byText("#verb-editor .actions button", "Save Verb"); }

  var VERB_STEPS = [
    { target: null, placement: "center", title: "Define a verb 🧙",
      html: "A <b>verb</b> is an action you run on a noun — an intake, a test. Let's define an <b>Intake</b> that produces <b>Sample</b> records." },
    { target: veProj, placement: "bottom", title: "1 · Project",
      html: "Same <b>Demo Lab</b> project.",
      beforeShow: async function () { await waitFor(function () { return optionExists(veProj(), "Demo Lab"); }); setReactValue(veProj(), "Demo Lab"); } },
    { target: veNewVerbBtn, placement: "bottom", title: "2 · New verb",
      html: "I'll start a new verb.",
      beforeShow: async function () { var b = veNewVerbBtn(); if (b) b.click(); await waitFor(function () { return document.getElementById("verb-editor"); }); } },
    { target: veName, placement: "right", title: "3 · Name it Intake",
      html: "Name the verb <b>Intake</b>, in a group called <b>Lab Runs</b>.",
      beforeShow: async function () { await waitFor(veName); setReactValue(veName(), "Intake"); var g = veNewGroup(); if (g) setReactValue(g, "Lab Runs"); } },
    { target: veNounRef, placement: "top", title: "4 · Acts on Sample",
      html: "Set what it acts on — the <b>Sample</b> noun. Runs of Intake will produce Sample records.",
      beforeShow: async function () { await waitFor(function () { return optionExists(veNounRef(), "Sample"); }); setReactValue(veNounRef(), "Sample"); } },
    { target: function () { return $("#verb-viewer") || $("#verb-editor"); }, placement: "left", title: "5 · Save the verb",
      html: "And I'll <b>Save</b> it — <b>Intake</b> is now defined and acts on <b>Sample</b>.",
      beforeShow: async function () { var b = veSave(); if (b) b.click(); await waitFor(function () { return $("#verb-viewer"); }); } },
    { target: null, placement: "center", title: "Verb ready ✅",
      html: "<b>Intake</b> is defined. Next: enter a real <b>Sample</b> record for it to operate on." },
  ];

  // ── noun_workbench (enter data) chapter ──────────────────────────────────────────────────────
  function nwProj() { return document.getElementById("project-select"); }
  function nwNoun() { return document.getElementById("nounTypeSelect"); }
  function nwField(name) { return document.querySelector('#dynamicForm [data-name="' + name + '"]'); }
  function nwSave() { return document.getElementById("saveBtn"); }

  var ENTER_STEPS = [
    { target: null, placement: "center", title: "Enter a record 🧙",
      html: "Now create a real <b>Sample</b> record — the data your verbs operate on." },
    { target: nwProj, placement: "bottom", title: "1 · Project",
      html: "<b>Demo Lab</b>.",
      beforeShow: async function () { await waitFor(function () { return optionExists(nwProj(), "Demo Lab"); }); setReactValue(nwProj(), "Demo Lab"); } },
    { target: nwNoun, placement: "bottom", title: "2 · Noun type",
      html: "The <b>Sample</b> noun.",
      beforeShow: async function () { await waitFor(function () { return optionExists(nwNoun(), "Sample"); }); setReactValue(nwNoun(), "Sample"); await waitFor(function () { return nwField("sample_id"); }); } },
    { target: function () { return $("#dynamicForm"); }, placement: "top", title: "3 · Fill the form",
      html: "I'll give it an id and its <b>received</b> + <b>due</b> times.",
      beforeShow: async function () {
        await waitFor(function () { return nwField("sample_id"); });
        setReactValue(nwField("sample_id"), "SPC-100");
        var now = Date.now();
        if (nwField("received_at")) setReactValue(nwField("received_at"), localDT(now - 3 * 3600e3));
        if (nwField("due_at")) setReactValue(nwField("due_at"), localDT(now + 26 * 3600e3));
      } },
    { target: nwSave, placement: "top", title: "4 · Save the record",
      html: "And <b>Save</b> it.",
      beforeShow: function () { var b = nwSave(); if (b) b.click(); } },
    { target: null, placement: "center", title: "Record created ✅",
      html: "A <b>Sample</b> now exists with a received + due time. Last stop: watch its clock tick in the runlog." },
  ];

  // ── runlog_workbench chapter (the payoff) ─────────────────────────────────────────────────────
  function rlProj() { return document.getElementById("project-select"); }
  function rlGroup() { return document.getElementById("verbgroup-select"); }
  // the run id ("run 001") lives in a HIDDEN column (run_ID / _run_id / primary_id_field), so it's
  // never in the row's text — target the first clickable row of the run-list GridTable instead.
  function rlRunRow() { return document.querySelector(".ui-grid tbody tr.clickable"); }
  function rlDataTab() { return byText(".tab-button", "Data Entry"); }

  var RUNLOG_STEPS = [
    { target: null, placement: "center", title: "Operate in the runlog 🧙",
      html: "The <b>runlog</b> is where you run verbs and work the data. Let's open the Intake run and watch the clock tick." },
    { target: rlProj, placement: "bottom", title: "1 · Project",
      html: "<b>Demo Lab</b>.",
      beforeShow: async function () { await waitFor(function () { return optionExists(rlProj(), "Demo Lab"); }); setReactValue(rlProj(), "Demo Lab"); } },
    { target: rlGroup, placement: "bottom", title: "2 · Verb group",
      html: "The <b>Lab Runs</b> group.",
      beforeShow: async function () { await waitFor(function () { return optionExists(rlGroup(), "Lab Runs"); }); setReactValue(rlGroup(), "Lab Runs"); } },
    { target: rlRunRow, placement: "bottom", title: "3 · Open the run",
      html: "I'll open <b>run 001</b>.",
      beforeShow: async function () { var r = await waitFor(rlRunRow); if (r) r.click(); await waitFor(rlDataTab); } },
    { target: rlDataTab, placement: "bottom", title: "4 · Data Entry",
      html: "Switch to the <b>Data Entry</b> tab — the editable grid.",
      beforeShow: async function () { var t = rlDataTab(); if (t) t.click(); await waitFor(function () { return document.querySelector(".rw-grid-host canvas"); }, 6000); } },
    { target: function () { return $(".rw-grid-host"); }, placement: "top", title: "5 · The live clock ⏱",
      html: "There's your <b>Sample</b> data — and the <b>hold_clock</b> column ticking live: <i>time since received · time until due</i>. Past-due rows flag <b>OVERDUE</b> in red." },
    { target: function () { return $(".rw-toolbar .panel-head") || $(".rw-toolbar"); }, placement: "bottom", title: "6 · Verified time",
      html: "And the clock is <b>NTP-verified</b> (the badge, top-right) — the same trusted time that stamps the audit trail." },
    { target: null, placement: "center", title: "That's GIMS 🎉",
      html: "Noun → adjective → verb → data → operate. You built a small lab grammar and watched a time-aware <b>Duration</b> clock tick against verified time. That's the whole loop — thanks for touring!" },
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

  // For chapters 3-5: the Sample noun should have its datetime fields + hold_clock as a live Duration
  // adjective (the state after chapter 2). Idempotent, so jumping straight to a later chapter works.
  function ensureDurationAdjective() {
    if (!window.GimsMock) return;
    var s = window.GimsMock.store(), n = s.nouns["Demo Lab"] && s.nouns["Demo Lab"].Sample;
    if (!n) return;
    n.fields.received_at = n.fields.received_at || { type: "datetime", required: true };
    n.fields.due_at = n.fields.due_at || { type: "datetime", required: true };
    n.fields.hold_clock = { type: "adjective", adjective_class: "Duration" };
    s.adjectives["Demo Lab"].hold_clock = {
      adjective: "hold_clock", adjective_class: "Duration", start_field: "received_at", end_field: "due_at",
      mode: "both", unit: "auto", overdue_style: "negative", applies_to: ["Sample"], "class": "Duration",
    };
    window.GimsMock.save();
  }

  // For chapter 5: ensure the Intake verb + its Lab Runs group/run + a few Sample records exist so the
  // runlog grid has rows whose hold_clock column ticks (one fresh, one overdue, one sub-minute).
  function ensureRunlogData() {
    ensureDurationAdjective();
    if (!window.GimsMock) return;
    var s = window.GimsMock.store();
    s.verbs["Demo Lab"].Intake = s.verbs["Demo Lab"].Intake || {
      description: "Log a sample into the lab", verb_group: "Lab Runs",
      data_entry_schema: { instructions: [], raw_data_inputs: [], set_up_inputs: { noun_type_ref: "Sample" }, interpretation: { tabs: [], parsers: [] } },
      linear_status: { enabled: false, steps: [] }, status_values: [],
    };
    s.runs["Demo Lab"]["Lab Runs"] = s.runs["Demo Lab"]["Lab Runs"] || [{ run_ID: "run 001", test_type: "Intake", logged_at: new Date().toISOString() }];
    s.records["Demo Lab"].Sample = s.records["Demo Lab"].Sample || [];
    var recs = s.records["Demo Lab"].Sample, have = {};
    recs.forEach(function (r) { have[r.sample_id] = true; });
    var now = Date.now(), iso = function (ms) { return new Date(ms).toISOString(); };
    [{ sample_id: "SPC-001", received_at: iso(now - 3 * 3600e3), due_at: iso(now + 26 * 3600e3) },
     { sample_id: "SPC-002", received_at: iso(now - 5 * 86400e3), due_at: iso(now - 2 * 3600e3) },
     { sample_id: "SPC-003", received_at: iso(now - 40e3), due_at: iso(now + 95e3) }
    ].forEach(function (d) { if (!have[d.sample_id]) recs.push(d); });
    window.GimsMock.save();
  }

  // datetime-local input value ("yyyy-mm-ddThh:mm", local) for chapter 4
  function localDT(ms) {
    var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  var CHAPTERS = [
    { id: "welcome", page: "welcome",          url: "/index.html",                  label: "Welcome",    built: true,
      desc: "The parts-of-speech idea + how the demo works" },
    { id: "noun",    page: "noun_configure",   url: "/pages/noun_configure.html",   label: "Noun",       built: true, ready: ".nc-toolbar .nc-select", steps: NOUN_STEPS,
      desc: "Define a Sample record type and give it date fields" },
    { id: "adj",     page: "adjective_editor", url: "/pages/adjective_editor.html", label: "Adjective",  built: true, ready: "#project", steps: ADJ_STEPS, setup: ensureSampleFields,
      desc: "Turn hold_clock into a live Duration timer" },
    { id: "verb",    page: "verb_editor",      url: "/pages/verb_editor.html",      label: "Verb",       built: true, ready: "#project",        steps: VERB_STEPS,   setup: ensureDurationAdjective,
      desc: "Define an Intake verb that acts on Sample" },
    { id: "enter",   page: "noun_workbench",   url: "/pages/noun_workbench.html",   label: "Enter data", built: true, ready: "#project-select", steps: ENTER_STEPS,  setup: ensureDurationAdjective,
      desc: "Create a real Sample record (received + due)" },
    { id: "runlog",  page: "runlog_workbench", url: "/pages/runlog_workbench.html", label: "Runlog",     built: true, ready: "#project-select", steps: RUNLOG_STEPS, setup: ensureRunlogData,
      desc: "Watch the hold_clock tick + the NTP clock badge" },
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
