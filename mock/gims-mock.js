/* gims-mock.js — the demo seam.
 *
 * Installs BEFORE the real GIMS page bundles run and:
 *   1. overrides window.fetch with an in-browser router (GIMS endpoint path -> handler),
 *   2. stubs window.GIMS so pages mount anonymously (onAuthed -> immediate, toast),
 *   3. keeps an in-memory store in sessionStorage so records you create in one chapter survive
 *      navigation to the next, and reset when you close the tab.
 *
 * NO real backend, NO network, NO persistence beyond the tab. This is a simulation.
 * Routes are added per chapter as the onboarding grows (noun -> adjective -> verb -> ... ).
 */
(function () {
  "use strict";

  var SS_KEY = "gims_demo_store_v3";
  var __origFetch = window.fetch.bind(window);

  // ── seed: a single empty-ish "Demo Lab" project the visitor builds up ──────────────────────────
  function seed() {
    return {
      projects: ["Demo Lab"],
      // project -> nounType -> schema {description, fields{}, primary_id_field, autogenerate_id, autogenerate_segments}
      nouns: {
        "Demo Lab": {
          "Sample": {
            description: "A single testable unit submitted to the lab.",
            fields: { sample_id: { type: "string", required: true } },
            primary_id_field: "sample_id",
            autogenerate_id: false,
            autogenerate_segments: [],
          },
        },
      },
      adjectives: { "Demo Lab": {} },   // project -> { adjName: entry } (name-keyed, attaches_to[])
      verbs: { "Demo Lab": {} },        // project -> { verbName: schema }
      records: { "Demo Lab": {} },      // project -> nounType -> [record,...]
      runs: { "Demo Lab": {} },         // project -> verbGroup -> [run-log entry]
      dataEntry: {},                    // "proj|group|run" -> [rows]
    };
  }

  var store;
  try { store = JSON.parse(sessionStorage.getItem(SS_KEY)) || seed(); }
  catch (e) { store = seed(); }
  function save() { try { sessionStorage.setItem(SS_KEY, JSON.stringify(store)); } catch (e) {} }

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────
  function J(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { "content-type": "application/json" } });
  }
  var ok = function (b) { return J(200, b); };
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function nowIso() { return new Date().toISOString(); }
  var TYPE_MAP = { number: "float", string: "string", date: "date", datetime: "datetime", adjective: "adjective" };

  // ── routes: {method, re, fn(match, query, body)} ──────────────────────────────────────────────
  var ROUTES = [];
  function route(method, re, fn) { ROUTES.push({ method: method, re: re, fn: fn }); }

  // ---- noun_configure ----
  route("GET", /^\/noun\/projects$/, function () { return ok(store.projects); });
  route("GET", /^\/noun\/types\/([^/]+)$/, function (m) { return ok(Object.keys(store.nouns[dec(m[1])] || {})); });
  route("GET", /^\/noun\/date_formats$/, function () { return ok(["yyyy-mm-dd", "mm/dd/yyyy", "dd/mm/yyyy", "yyyy-mm", "yyyy"]); });
  route("GET", /^\/noun\/describe\/([^/]+)\/([^/]+)$/, function (m) {
    var n = (store.nouns[dec(m[1])] || {})[dec(m[2])];
    if (!n) return J(404, { error_code: "NOUN_NOT_FOUND", message: "Noun not found" });
    return ok({ name: dec(m[2]), fields: n.fields, primary_id_field: n.primary_id_field,
                autogenerate_id: !!n.autogenerate_id, autogenerate_segments: n.autogenerate_segments || [] });
  });
  route("POST", /^\/noun\/edit\/([^/]+)\/([^/]+)$/, function (m, q, body) {
    var n = (store.nouns[dec(m[1])] || {})[dec(m[2])];
    if (!n) return J(404, { message: "Noun not found" });
    var a = body.action;
    if (a === "add") {
      var it = TYPE_MAP[body.field_type] || body.field_type;
      var e = { type: it };
      if (body.required) e.required = true;
      if (it === "date" && body.format) e.format = body.format;
      n.fields[body.field_name] = e;
    } else if (a === "edit") {
      var f = n.fields[body.field_name]; if (!f) return J(404, { message: "field not found" });
      if (body.new_type) {
        f.type = TYPE_MAP[body.new_type] || body.new_type;
        if (f.type !== "date") delete f.format; else if (body.format_override) f.format = body.format_override;
      }
      if (body.required != null) { if (body.required) f.required = true; else delete f.required; }
    } else if (a === "delete") {
      delete n.fields[body.field_name];
    } else if (a === "rename") {
      if (n.fields[body.old_name]) {
        n.fields[body.new_name] = n.fields[body.old_name]; delete n.fields[body.old_name];
        if (n.primary_id_field === body.old_name) n.primary_id_field = body.new_name;
      }
    } else if (a === "set_id") {
      n.primary_id_field = body.field_name;
      if (body.autogenerate === "yes") { n.autogenerate_id = true; if (body.segments) n.autogenerate_segments = body.segments; }
      else if (body.autogenerate === "no") { n.autogenerate_id = false; n.autogenerate_segments = []; }
    }
    save();
    return ok({ status: a + "ed", ok: true });
  });
  route("POST", /^\/noun\/register\/([^/]+)$/, function (m, q, body) {
    var p = dec(m[1]); store.nouns[p] = store.nouns[p] || {};
    store.nouns[p][body.noun_name] = body.schema || { fields: {} };
    save(); return ok({ status: "registered" });
  });

  // ---- shared project schema reads (used by adjective/verb/workbench pages) ----
  route("GET", /^\/project\/([^/]+)\/noun_types$/, function (m) { return ok(store.nouns[dec(m[1])] || {}); });
  route("GET", /^\/project\/([^/]+)\/verb_types$/, function (m) { return ok(store.verbs[dec(m[1])] || {}); });

  // ---- adjective_editor ----
  var ADJ_CLASSES = ["ActionRequirement", "Tag", "Reference", "ReferenceList", "Picture", "Duration"];
  function adjEntries(p) { return store.adjectives[p] || (store.adjectives[p] = {}); }
  route("GET", /^\/adjective\/projects$/, function () { return ok(store.projects); });
  route("GET", /^\/adjective\/classes$/, function () { return ok(ADJ_CLASSES); });
  route("GET", /^\/adjective\/nouns\/([^/]+)$/, function (m) { return ok(store.nouns[dec(m[1])] || {}); });
  route("GET", /^\/adjective\/list\/([^/]+)\/([^/]+)$/, function (m) {
    var p = dec(m[1]), n = dec(m[2]); var out = [];
    var es = adjEntries(p);
    for (var k in es) { if ((es[k].applies_to || []).indexOf(n) !== -1) out.push(es[k]); }
    return ok(out);
  });
  route("GET", /^\/adjective\/configure\/([^/]+)\/([^/]+)\/([^/]+)$/, function (m) {
    var e = adjEntries(dec(m[1]))[dec(m[3])];
    return e ? ok(e) : J(404, { error_code: "ADJECTIVE_NOT_FOUND", message: "Adjective not found" });
  });
  route("GET", /^\/adjective\/options\/([^/]+)\/([^/]+)\/([^/]+)$/, function (m) {
    var e = adjEntries(dec(m[1]))[dec(m[3])] || {};
    if ((e.adjective_class || "").toLowerCase() === "duration") {
      return ok({ start_field: e.start_field || null, end_field: e.end_field || null,
                  mode: e.mode || "elapsed", unit: e.unit || "auto", overdue_style: e.overdue_style || "negative" });
    }
    return ok({ definition: e.definition || "", valid_options: e.valid_options || [] });
  });
  route("POST", /^\/adjective\/promote\/([^/]+)\/([^/]+)$/, function (m, q, body) {
    var p = dec(m[1]), n = dec(m[2]);
    var noun = (store.nouns[p] || {})[n]; if (!noun) return J(404, { message: "Noun not found" });
    var field = body.adjective;
    if (noun.primary_id_field === field) return J(400, { error_code: "CANNOT_PROMOTE_PRIMARY_ID", message: "Cannot promote the primary ID field" });
    adjEntries(p)[field] = { adjective: field, adjective_class: body.adjective_class, applies_to: [n], "class": body.adjective_class };
    noun.fields[field] = { type: "adjective", adjective_class: body.adjective_class };
    save(); return ok({ status: "promoted" });
  });
  route("POST", /^\/adjective\/update\/([^/]+)\/([^/]+)\/([^/]+)$/, function (m, q, body) {
    var p = dec(m[1]), a = dec(m[3]);
    if (!adjEntries(p)[a]) return J(404, { message: "Adjective not found" });
    body.applies_to = body.applies_to || adjEntries(p)[a].applies_to;
    adjEntries(p)[a] = body;
    save(); return ok({ status: "updated" });
  });
  route("POST", /^\/adjective\/demote\/([^/]+)\/([^/]+)\/([^/]+)$/, function (m) {
    var p = dec(m[1]), n = dec(m[2]), a = dec(m[3]);
    delete adjEntries(p)[a];
    var noun = (store.nouns[p] || {})[n];
    if (noun && noun.fields[a]) noun.fields[a] = { type: "string" };
    save(); return ok({ status: "demoted" });
  });

  // ---- verb_editor (chapter 3) ----
  route("GET", /^\/verb\/projects$/, function () { return ok(store.projects); });
  route("GET", /^\/noun\/valid-refs\/([^/]+)$/, function (m) { return ok({ valid_noun_types: Object.keys(store.nouns[dec(m[1])] || {}) }); });
  route("GET", /^\/verb\/log-schema\/([^/]+)\/([^/]+)$/, function () { return ok({ primary_id: null, fields: {} }); });
  route("POST", /^\/verb\/log-schema\/([^/]+)\/([^/]+)$/, function () { return ok({ status: "saved" }); });
  route("GET", /^\/verb\/([^/]+)$/, function (m) { return ok(store.verbs[dec(m[1])] || {}); });
  route("GET", /^\/verb\/([^/]+)\/([^/]+)$/, function (m) { var v = (store.verbs[dec(m[1])] || {})[dec(m[2])]; return v ? ok(v) : J(404, { message: "Verb not found" }); });
  route("PUT", /^\/verb\/([^/]+)\/([^/]+)$/, function (m, q, body) { var p = dec(m[1]); store.verbs[p] = store.verbs[p] || {}; store.verbs[p][dec(m[2])] = body; save(); return ok({ status: "updated", verb: dec(m[2]) }); });
  route("POST", /^\/verb\/([^/]+)\/([^/]+)$/, function (m, q, body) {
    var p = dec(m[1]), name = dec(m[2]);
    store.verbs[p] = store.verbs[p] || {};
    store.verbs[p][name] = body;
    var grp = body.verb_group || "Runs";
    store.runs[p] = store.runs[p] || {};
    if (!store.runs[p][grp]) store.runs[p][grp] = [{ run_ID: "run 001", test_type: name, logged_at: nowIso() }];
    save(); return ok({ status: "created", verb: name });
  });

  // ---- noun_workbench (chapter 4) — prefix /api/noun_workbench ----
  route("GET", /^\/api\/noun_workbench\/projects$/, function () { return ok(store.projects); });
  route("GET", /^\/api\/noun_workbench\/([^/]+)$/, function (m) { return ok(Object.keys(store.nouns[dec(m[1])] || {})); });
  route("GET", /^\/api\/noun_workbench\/([^/]+)\/([^/]+)\/items$/, function (m) { return ok(((store.records[dec(m[1])] || {})[dec(m[2])]) || []); });
  route("GET", /^\/api\/noun_workbench\/([^/]+)\/([^/]+)\/schema$/, function (m) {
    var n = (store.nouns[dec(m[1])] || {})[dec(m[2])];
    if (!n) return J(404, { message: "Noun not found" });
    return ok({ fields: n.fields, primary_id_field: n.primary_id_field, autogenerate_id: !!n.autogenerate_id });
  });
  route("GET", /^\/api\/noun_workbench\/([^/]+)\/([^/]+)\/references\/([^/]+)$/, function () { return ok([]); });
  route("POST", /^\/api\/noun_workbench\/([^/]+)\/([^/]+)\/validate$/, function () { return ok({ ok: true }); });
  route("POST", /^\/api\/noun_workbench\/([^/]+)\/([^/]+)\/update\/([^/]+)$/, function (m) { return ok({ ok: true, id: dec(m[3]) }); });
  route("POST", /^\/api\/noun_workbench\/([^/]+)\/([^/]+)\/create$/, function (m, q, body) {
    var p = dec(m[1]), nt = dec(m[2]);
    store.records[p] = store.records[p] || {}; store.records[p][nt] = store.records[p][nt] || [];
    var n = (store.nouns[p] || {})[nt] || {}, pid = n.primary_id_field || "id";
    var rec = {}; for (var k in body) if (body[k] !== "") rec[k] = body[k];
    var id = rec[pid] || (nt.slice(0, 3).toUpperCase() + "-" + (store.records[p][nt].length + 1));
    rec[pid] = id; store.records[p][nt].push(rec);
    save(); return ok({ ok: true, id: id });
  });

  // ---- runlog_workbench + grid + compliance (chapter 5) ----
  function nounForRun(p, g) {
    var runs = (store.runs[p] || {})[g] || [], verb = runs[0] && runs[0].test_type;
    var v = verb && (store.verbs[p] || {})[verb], de = v && v.data_entry_schema;
    return (de && de.set_up_inputs && de.set_up_inputs.noun_type_ref) || null;
  }
  route("GET", /^\/runlog_data_dump\/projects$/, function () { return ok(store.projects); });
  route("GET", /^\/runlog_data_dump\/verb_groups\/([^/]+)$/, function (m) { return ok(Object.keys(store.runs[dec(m[1])] || {})); });
  route("GET", /^\/runlog\/([^/]+)\/([^/]+)$/, function (m) {
    var runs = (store.runs[dec(m[1])] || {})[dec(m[2])] || [];
    return ok({ headers: ["run_ID", "test_type", "logged_at"], meta: { primary_id_field: "run_ID" },
      rows: runs.map(function (r) { return [r.run_ID, r.test_type, r.logged_at]; }) });
  });
  route("GET", /^\/runlog\/([^/]+)\/([^/]+)\/([^/]+)\/dump$/, function (m) {
    var runs = (store.runs[dec(m[1])] || {})[dec(m[2])] || [];
    var run = runs.filter(function (r) { return String(r.run_ID) === dec(m[3]); })[0] || { run_ID: dec(m[3]), test_type: null };
    return ok({ run_entry: { run_ID: run.run_ID, test_type: run.test_type, verb: run.test_type }, verb: run.test_type, headers: [], rows: [] });
  });
  route("GET", /^\/schema\/verb\/([^/]+)\/([^/]+)$/, function (m) {
    var v = (store.verbs[dec(m[1])] || {})[dec(m[2])] || {}, de = v.data_entry_schema || {};
    var ref = (de.set_up_inputs && de.set_up_inputs.noun_type_ref) || null;
    return ok({ data_entry_schema: { set_up_inputs: { noun_type_ref: ref }, noun_type: ref } });
  });
  route("GET", /^\/grid\/load\/([^/]+)\/([^/]+)\/([^/]+)$/, function (m) {
    var p = dec(m[1]), nt = nounForRun(p, dec(m[2]));
    var rows = nt ? ((store.records[p] || {})[nt] || []) : [];
    return ok(rows.map(function (r) { return Object.assign({}, r); }));
  });
  route("GET", /^\/grid\/noun_info\/([^/]+)\/([^/]+)$/, function (m) {
    var n = (store.nouns[dec(m[1])] || {})[dec(m[2])] || {}, fields = n.fields || {};
    return ok({ primary_id: n.primary_id_field || "id", headers_from_schema: Object.keys(fields), autogenerate_id: !!n.autogenerate_id, picture_fields: [] });
  });
  route("GET", /^\/grid\/reference_adjectives\/([^/]+)\/([^/]+)$/, function () { return ok({ names: [], detail: {} }); });
  route("GET", /^\/grid\/duration_adjectives\/([^/]+)\/([^/]+)$/, function (m) {
    var p = dec(m[1]), nt = dec(m[2]), n = (store.nouns[p] || {})[nt] || {}, fields = n.fields || {}, detail = {};
    function meta(fn) { var c = fields[fn] || {}; return { type: c.type, format: c.format || null }; }
    for (var f in fields) {
      if (fields[f].type === "adjective" && (fields[f].adjective_class || "").toLowerCase() === "duration") {
        var a = (store.adjectives[p] || {})[f] || {};
        detail[f] = { start_field: a.start_field, end_field: a.end_field, mode: a.mode || "both", unit: a.unit || "auto", overdue_style: a.overdue_style || "negative", start_meta: meta(a.start_field), end_meta: meta(a.end_field) };
      }
    }
    return ok({ project: p, noun_type: nt, names: Object.keys(detail), detail: detail, server_now: nowIso(),
      time_status: { synced: true, source: "ntp_validated", offset_seconds: -0.4, note: "Host clock within tolerance of the NTP reference." } });
  });
  route("GET", /^\/grid\/retest_options\/([^/]+)\/([^/]+)\/([^/]+)$/, function () { return ok({ options: [] }); });
  route("GET", /^\/grid\/ref_options\/([^/]+)\/([^/]+)\/([^/]+)$/, function () { return ok({ options: [] }); });
  route("POST", /^\/grid\/generate_id\/([^/]+)\/([^/]+)$/, function () { return ok({ id: "GEN-" + (Math.random() * 1e4 | 0) }); });
  route("POST", /^\/gui\/grid\/save\/([^/]+)\/([^/]+)\/([^/]+)$/, function () { return ok({ status: "Save successful" }); });
  route("GET", /^\/compliance\/time$/, function () {
    return ok({ now_utc: nowIso(), source: "ntp_validated", synced: true, offset_seconds: -0.4, skew_threshold_seconds: 2, ntp_server: "pool.ntp.org", note: "Host clock within tolerance of the NTP reference." });
  });

  // ── dispatch + fetch override ─────────────────────────────────────────────────────────────────
  function passthrough(pathname) {
    return pathname.startsWith("/static/") || pathname.startsWith("/pages/") ||
           pathname.startsWith("/mock/") || pathname.startsWith("/tutorial/") ||
           pathname === "/" || pathname === "/index.html" ||
           /\.(js|css|svg|png|jpe?g|ico|woff2?|map|json)$/i.test(pathname);
  }

  window.fetch = function (input, init) {
    var url = (input instanceof Request) ? input.url : String(input);
    var method = ((init && init.method) || (input instanceof Request && input.method) || "GET").toUpperCase();
    var u;
    try { u = new URL(url, location.origin); } catch (e) { return __origFetch(input, init); }
    if (u.origin === location.origin && passthrough(u.pathname)) return __origFetch(input, init);

    var hit = null;
    for (var i = 0; i < ROUTES.length; i++) {
      if (ROUTES[i].method !== method) continue;
      var mm = u.pathname.match(ROUTES[i].re);
      if (mm) { hit = { fn: ROUTES[i].fn, m: mm }; break; }
    }
    if (!hit) {
      return Promise.resolve(J(404, { error_code: "MOCK_NOT_FOUND",
        message: "(demo mock) no handler for " + method + " " + u.pathname }));
    }
    var body = null;
    if (init && init.body && typeof init.body === "string") { try { body = JSON.parse(init.body); } catch (e) { body = init.body; } }
    var q = Object.fromEntries(u.searchParams);
    var delay = 14 + (Math.random() * 26 | 0);   // a touch of realism, but snappy (multi-fetch reloads add up)
    return new Promise(function (resolve) {
      setTimeout(function () {
        try { resolve(hit.fn(hit.m, q, body)); }
        catch (e) { resolve(J(500, { message: "(demo mock) handler error: " + (e && e.message) })); }
      }, delay);
    });
  };

  // ── window.GIMS stub: mount pages anonymously + a real-looking toast ──────────────────────────
  var G = (window.GIMS = window.GIMS || {});
  G.onAuthed = function (cb) { try { cb(); } catch (e) { console.error(e); } };
  if (typeof G.toast !== "function") {
    G.toast = function (msg, kind) {
      try {
        var host = document.querySelector(".toasts");
        if (!host) { console.log("[toast:" + (kind || "ok") + "]", msg); return; }
        var d = document.createElement("div");
        d.className = "toast " + (kind || "ok");
        d.textContent = msg;
        host.appendChild(d);
        setTimeout(function () { d.remove(); }, 3400);
      } catch (e) {}
    };
  }

  // ── public API for chapter scripts to add routes + reset ──────────────────────────────────────
  window.GimsMock = {
    route: route,
    J: J, ok: ok, dec: dec, TYPE_MAP: TYPE_MAP,
    store: function () { return store; },
    save: save,
    reset: function () { store = seed(); save(); },
  };
})();
