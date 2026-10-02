/*! cluster-items.js — Quick-ref メモの「まとまり」自動検出（DOM非依存・依存ライブラリなし）
 *  使い方: ClusterItems.cluster(items) => [{ ids, size, from, to, tags, title }]（件数の多い順）
 *  方針: ①連番の題名 ②45分以内かつ内容が近い ③まとまり同士の内容が近ければ日をまたいで統合。タグは使わない。
 *  保護メモ(sensitive=true)は題名・本文とも読まず、対象外にする。
 */
(function (root) {
  'use strict';
  var P = { head: 4000, gapMin: 45, near: 0.08, merge: 0.30 };

  function plain(h) {
    return String(h || '').replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function grams(x) {
    var t = (((x.title || '') + ' ').repeat(3) + plain(x.body).slice(0, P.head)).toLowerCase().replace(/\s+/g, ' ');
    var m = new Map();
    function add(k, w) { m.set(k, (m.get(k) || 0) + w); }
    for (var i = 0; i + 3 <= t.length; i++) add(t.substr(i, 3), 1);
    (t.match(/[a-z][a-z0-9_\-\.]{3,}/g) || []).forEach(function (w) { add('W:' + w, 2); });
    return m;
  }
  function cos(a, b) {
    if (a.size > b.size) { var t = a; a = b; b = t; }
    var s = 0; a.forEach(function (w, k) { var v = b.get(k); if (v) s += w * v; });
    return s;
  }
  function norm(v) {
    var s = 0; v.forEach(function (w) { s += w * w; }); s = Math.sqrt(s) || 1;
    v.forEach(function (w, k) { v.set(k, w / s); });
    return v;
  }
  function stem(t) { return String(t || '').toLowerCase().replace(/[0-9０-９]+/g, '').replace(/[\s_\-\/・:：\.]+/g, ''); }

  function cluster(items, opts) {
    var o = Object.assign({}, P, opts || {});
    var xs = (items || []).filter(function (x) { return x && !x.sensitive; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
    var n = xs.length; if (!n) return [];
    var docs = xs.map(grams), df = new Map();
    docs.forEach(function (d) { d.forEach(function (_, k) { df.set(k, (df.get(k) || 0) + 1); }); });
    var V = docs.map(function (d) {
      var v = new Map();
      d.forEach(function (c, k) {
        var idf = Math.log(n / (1 + df.get(k)));
        if (idf > 0.3 && df.get(k) < n * 0.5) v.set(k, (1 + Math.log(c)) * idf);
      });
      return norm(v);
    });
    // ①②: 連番の題名、または45分以内で内容が近いものを同じ作業にする
    var sess = [[0]];
    for (var i = 1; i < n; i++) {
      var last = sess[sess.length - 1], p = last[last.length - 1];
      var gap = (xs[i].createdAt - xs[p].createdAt) / 60000, s1 = stem(xs[i].title);
      if ((gap <= o.gapMin && cos(V[i], V[p]) >= o.near) || (s1.length >= 3 && s1 === stem(xs[p].title) && gap <= 1440)) last.push(i);
      else sess.push([i]);
    }
    // ③: 作業同士の中心ベクトルが近ければ、日をまたいで統合（平均連結の凝集）
    function centroid(idx) {
      var c = new Map();
      idx.forEach(function (i) { V[i].forEach(function (w, k) { c.set(k, (c.get(k) || 0) + w); }); });
      return norm(c);
    }
    var m = sess.length, cl = sess.map(function (s) { return s.slice(); }), C = cl.map(centroid), S = [], alive = [];
    for (var a = 0; a < m; a++) { S.push(new Float64Array(m)); alive.push(true); }
    for (a = 0; a < m; a++) for (var b = a + 1; b < m; b++) S[a][b] = S[b][a] = cos(C[a], C[b]);
    for (;;) {
      var best = -1, ba = -1, bb = -1;
      for (a = 0; a < m; a++) if (alive[a]) for (b = a + 1; b < m; b++) if (alive[b] && S[a][b] > best) { best = S[a][b]; ba = a; bb = b; }
      if (best < o.merge) break;
      cl[ba] = cl[ba].concat(cl[bb]); alive[bb] = false; C[ba] = centroid(cl[ba]);
      for (var c = 0; c < m; c++) if (alive[c] && c !== ba) S[ba][c] = S[c][ba] = cos(C[ba], C[c]);
    }
    return cl.filter(function (_, i) { return alive[i]; }).map(function (g) {
      g.sort(function (x, y) { return x - y; });
      var tc = {}; g.forEach(function (i) { (xs[i].tags || []).forEach(function (t) { tc[t] = (tc[t] || 0) + 1; }); });
      return {
        ids: g.map(function (i) { return xs[i].id; }), size: g.length,
        from: xs[g[0]].createdAt, to: xs[g[g.length - 1]].createdAt,
        tags: Object.keys(tc).sort(function (x, y) { return tc[y] - tc[x]; }).slice(0, 3), title: xs[g[0]].title || ''
      };
    }).sort(function (x, y) { return y.size - x.size || x.from - y.from; });
  }

  var api = { cluster: cluster, params: P };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ClusterItems = api;
})(typeof window !== 'undefined' ? window : globalThis);
