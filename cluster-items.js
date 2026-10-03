/*! cluster-items.js — Quick-ref メモの「まとまり」自動検出（DOM非依存・依存ライブラリなし）
 *  使い方: ClusterItems.cluster(items) => [{ ids, size, from, to, tags, title }]（件数の多い順）
 *  方針: ①連番の題名 ②45分以内かつ内容が近い ③まとまり同士の内容が近ければ日をまたいで統合。タグは使わない。
 *  保護メモ(sensitive=true)は題名・本文とも読まず、対象外にする。
 */
(function (root) {
  'use strict';
  var P = { head: 4000, gapMin: 45, near: 0.08, merge: 0.22, code: 0.52 };   // merge: 設計の議論を1つの流れにまとめるため0.30→0.22

  function plain(h) {
    return String(h || '').replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function grams(x, code) {
    var t = (((x.title || '') + ' ').repeat(3) + (code ? '' : plain(x.body).slice(0, P.head))).toLowerCase().replace(/\s+/g, ' ');
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
    var docs = xs.map(function (x) { return grams(x, codeRatio(x.body) < o.code); }), df = new Map();
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

  // ---- まとまりの「意味」を出す（AI不使用・外部送信なし）----
  var STOP = /^(こと|もの|ため|よう|これ|それ|場合|以下|以上|今回|確認|必要|対応|追加|使用|利用|実装|修正|問題|状態|部分|内容|結果|方法|理由|前提|現在|自分|ユーザー|可能|目的|処理|機能|設定|表示|変更|保存|既存|新規|作成|実行|全体|一つ|最後|最初|同じ|全部|重要|最小|最大|通常|基本|実際|本当|以外|場所|場面|情報|データ|ファイル|コード|アプリ|メモ|画面|操作|入力|出力|項目|一覧|次回|今後|現状|結論|理解|説明|質問|回答|意味|仕組み|方向|考え|ポイント|ここまで|ところ|ほう|わけ|はず)$/;
  var CODE = /^(span|style|font|color|size|line|height|margin|padding|width|solid|class|none|true|false|null|this|that|with|from|have|will|your|file|text|const|function|return|string|data|items|item|index|html|json|console|error|value|name|type|button|input|div|http|https|docs)$/;
  var NEXT = /(次に|次の一手|次のステップ|確認したい|確認すべき|やるべき|未解決|課題|TODO|決めるべき|見せて(もらえますか|ください)|貼って(ください|もらえますか)|教えてください|次どうする|どれに進める|進めますか)/;
  function lead(t) { return t.replace(/^(はい|うん|了解|承知|なるほど|OK)[、。！!\s]*/, '').replace(/^.{0,8}さん[、。！!\s]*/, ''); }
  var SECRET = /[0-9a-f]{20,}|bearer|token|secret|api[-_]?key|password/i;

  function textOf(body) {
    return String(body || '').replace(/<(br|\/p|\/div|\/li|\/tr)[^>]*>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  // 本文のうち「読める文章」の割合。低いものはコードを貼っただけのメモ
  function codeRatio(body) {
    var t = textOf(body); if (!t.length) return 1;
    var keep = t.split('\n').map(function (s) { return s.trim(); }).filter(function (s) {
      return s && !/^(PS [A-Z]:|const |let |var |function |import |export |if \(|for \(|return |<|\.|#|@|\}|\{)/.test(s);
    }).join('').length;
    return keep / t.length;
  }
  function lines(body) {
    var t = textOf(body);
    return t.split('\n').map(function (s) { return s.trim(); }).filter(function (s) {
      if (!s) return false;
      var sym = 0; for (var i = 0; i < s.length; i++) if ('{}();=<>[]$\\/;:"\'`|&*#'.indexOf(s[i]) >= 0) sym++;
      if (sym / s.length > 0.18) return false;
      var ascii = 0; for (var q = 0; q < s.length; q++) if (s.charCodeAt(q) < 128) ascii++;
      if (s.length >= 8 && ascii / s.length >= 0.9) return false;   // 英数字だけの行（コード・コマンド・CSS）は読まない
      return !/^(PS [A-Z]:|const |let |var |function |import |export |if \(|for \(|return |<|\.|#|@|\}|\{)/.test(s);
    });
  }
  function termSet(text) {
    var set = new Set();
    (text.match(/[ァ-ヶー]{3,}|[一-龥]{2,}|[A-Za-z][A-Za-z0-9_\-\.]{3,}/g) || []).forEach(function (w) {
      if (/^[A-Za-z]/.test(w)) { w = w.toLowerCase(); if (CODE.test(w) || /^[0-9a-f]{8,}$/.test(w)) return; }
      else if (STOP.test(w)) return;
      set.add(w);
    });
    return set;
  }

  // groups: cluster() の結果のうち2件以上のもの。戻り値は groups と同じ並びの説明
  function describeAll(groups, items) {
    var by = new Map(), info = new Map(), df = new Map();
    (items || []).forEach(function (x) { if (x && !x.sensitive) by.set(x.id, x); });
    by.forEach(function (x, id) {
      var ls = lines(x.body), code = codeRatio(x.body) < P.code;
      var ts = termSet((x.title || '') + '\n' + (code ? '' : ls.join('\n').slice(0, 8000)));
      info.set(id, { lines: ls, terms: ts });
      ts.forEach(function (w) { df.set(w, (df.get(w) || 0) + 1); });
    });
    var N = by.size;
    return groups.map(function (g) {
      var gdf = new Map(), sc = [], minDf = Math.min(2, g.ids.length);
      g.ids.forEach(function (id) { var o = info.get(id); if (o) o.terms.forEach(function (w) { gdf.set(w, (gdf.get(w) || 0) + 1); }); });
      gdf.forEach(function (c, w) { if (c >= minDf) sc.push([c * Math.log(1 + N / df.get(w)) * Math.sqrt(c / df.get(w)), w]); });
      sc.sort(function (a, b) { return b[0] - a[0]; });
      // 連番の版（同じ題名の幹が3件以上）は1つにたたむ
      var stems = new Map(), entries = [], runs = {};
      g.ids.forEach(function (id) { var k = stem(by.get(id).title); if (k.length >= 3) stems.set(k, (stems.get(k) || 0) + 1); });
      g.ids.forEach(function (id) {
        var x = by.get(id), k = stem(x.title);
        if (k.length >= 3 && stems.get(k) >= 3) {
          if (!runs[k]) { runs[k] = { type: 'run', label: (x.title || '').replace(/[0-9０-９\s]+$/, '') || x.title, ids: [] }; entries.push(runs[k]); }
          runs[k].ids.push(id);
        } else entries.push({ type: 'item', id: id });
      });
      // 現在地: 最後のメモの冒頭と、直近のメモにある「次に〜」「確認したい〜」などの行
      var lastLines = info.get(g.ids[g.ids.length - 1]).lines;
      var head = ''; for (var i = 0; i < lastLines.length; i++) { var h = lead(lastLines[i]); if (h.length >= 15 && !SECRET.test(h)) { head = h.slice(0, 90); break; } }
      var next = [];
      for (var k2 = g.ids.length - 1; k2 >= 0 && k2 >= g.ids.length - 3 && next.length < 2; k2--) {
        var ls2 = info.get(g.ids[k2]).lines;
        for (var j = ls2.length - 1; j >= 0 && next.length < 2; j--) {
          var s = ls2[j];
          if (/^(次どうする|次はどうする|どれに進める)[？?]?$/.test(s) && ls2[j + 1]) {   // 「次どうする？」の後ろの選択肢を拾う
            var opt = ls2.slice(j + 1, j + 3).map(function (t) { return t.replace(/^[•・\-*]\s*/, ''); }).join(' / ').slice(0, 90);
            if (!SECRET.test(opt)) { next.push('選択肢: ' + opt); continue; }
          }
          if (s.length >= 14 && s.length <= 120 && !/^["'`(]|[,;{、]$/.test(s) && NEXT.test(s) && !SECRET.test(s) && next.indexOf(s.slice(0, 90)) < 0) next.push(s.slice(0, 90));
        }
      }
      return { keywords: sc.slice(0, 4).map(function (a) { return a[1]; }), entries: entries, head: head, next: next };
    });
  }

  // ---- AI要約用のプロンプトを作る（外部送信の直前に使う）----
  // 送るのは、保護メモを除き、コード行・秘密らしい行（トークン・長い英数字列など）を除いた本文だけ
  function safeLines(body) {
    return lines(body).filter(function (s) { return !SECRET.test(s) && !/[A-Za-z0-9_\-]{32,}/.test(s); });
  }
  var PROMPT_HEAD = '以下は、同じテーマで書かれた一連のメモです（古い順）。本人の言葉とAIの返答が混ざっています。\n' +
    '次の3項目だけを、日本語で各1〜2文、合計3行で書いてください。前置き・記号・箇条書きは不要です。\n' +
    '何について: （このメモ群の主題）\n結論・現在地: （どこまで決まった／分かったか）\n未解決・次の一手: （残っていること）\n' +
    '本文に書かれていないことは足さないでください。分からない項目は「不明」と書いてください。\n';
  function summaryPrompt(items, opts) {
    var o = Object.assign({ total: 12000, per: 1500 }, opts || {});
    var xs = (items || []).filter(function (x) { return x && !x.sensitive; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
    var cnt = {}, seen = {}, pick = [], omitted = 0;
    xs.forEach(function (x) { var k = stem(x.title); if (k.length >= 3) cnt[k] = (cnt[k] || 0) + 1; });
    xs.forEach(function (x) {   // 連番の版（同じ題名の幹が3件以上）は最初と最後だけ送る
      var k = stem(x.title);
      if (k.length >= 3 && cnt[k] >= 3) { seen[k] = (seen[k] || 0) + 1; if (seen[k] !== 1 && seen[k] !== cnt[k]) { omitted++; return; } }
      pick.push(x);
    });
    var per = Math.max(300, Math.min(o.per, Math.floor(o.total / Math.max(1, pick.length))));
    var parts = pick.map(function (x, i) {
      var t = safeLines(x.body).join('\n');
      if (t.length > per) t = t.slice(0, Math.floor(per * 0.6)) + '\n…\n' + t.slice(-Math.floor(per * 0.4));
      var d = new Date(x.createdAt);
      return '【' + (i + 1) + '】' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + (x.title || '(無題)') + '\n' + t;
    });
    return PROMPT_HEAD + (omitted ? '（連番の版のうち' + omitted + '件は省略しています）\n' : '') + '\n--- メモ（' + pick.length + '件）---\n' + parts.join('\n\n');
  }

  var api = { cluster: cluster, describeAll: describeAll, summaryPrompt: summaryPrompt, params: P };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ClusterItems = api;
})(typeof window !== 'undefined' ? window : globalThis);
