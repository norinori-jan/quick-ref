/*! flow-render.js — テキスト → フローチャートSVG（DOM非依存・依存ライブラリなし）
 *
 *  書き方（1行1接続。→ か -> で繋ぐ。チェーンOK）
 *    (開始) -> 入力 -> {OK?}
 *    {OK?} -> 保存 : はい
 *    {OK?} -> 入力 : いいえ
 *    保存 -> (終了)
 *  形:  (text)=角丸(開始/終了)  {text}=ひし形(判断)  text か [text]=四角
 *  ラベル: 行末に " : ラベル"（または全角「：」）。行頭 # はコメント。
 *
 *  使い方:  FlowRender.render(text) => { svg, width, height, nodes, edges }
 *  Quick-ref組み込み時は、この text を item.fields.embeddedFlows に { id, text, left, top } で保存する
 *  （表の embeddedTables と同じ方式。textなので全文検索にも載せられる: FlowRender.searchText(text)）
 */
(function (root) {
  'use strict';
  var NODE_H = 40, DIA_H = 60, GAP_X = 32, GAP_Y = 60, PAD = 24, CHAR_W = 14;

  // ① 解析: テキスト → ノード/エッジ
  function parseToken(tok) {
    tok = tok.trim();
    var shape = 'box', text = tok, m;
    if ((m = tok.match(/^\{(.*)\}$/))) { shape = 'diamond'; text = m[1]; }
    else if ((m = tok.match(/^\((.*)\)$/))) { shape = 'pill'; text = m[1]; }
    else if ((m = tok.match(/^\[(.*)\]$/))) { text = m[1]; }
    text = text.trim();
    return { id: text, text: text, shape: shape };
  }

  function parse(src) {
    var nodes = {}, order = [], edges = [];
    function add(n) {
      if (!nodes[n.id]) { nodes[n.id] = n; order.push(n.id); }
      else if (n.shape !== 'box' && nodes[n.id].shape === 'box') nodes[n.id].shape = n.shape;
      return n.id;
    }
    var lines = String(src || '').split(/\r?\n/);
    // かんたん書き: 矢印が1つも無ければ「1行=1ステップ」として上から順に繋ぐ
    var hasArrow = lines.some(function (l) { return /->|→/.test(l) && l.trim().charAt(0) !== '#'; });
    if (!hasArrow) {
      var seen = {}, steps = [];
      lines.forEach(function (l) {
        l = l.trim().replace(/^(?:[-*・●○]|\d+[.．)）])\s*/, '').replace(/\s*[:：]\s*/g, '\u2236');
        if (!l || l.charAt(0) === '#') return;
        // 同じ文言が複数回出ても、別のステップとして扱う（ゼロ幅スペースで区別）
        seen[l] = (seen[l] || 0) + 1;
        for (var k = 1; k < seen[l]; k++) l += '\u200b';
        steps.push(l);
      });
      lines = steps.length > 1 ? steps.slice(1).map(function (s, i) { return steps[i] + ' -> ' + s; }) : steps;
    }
    lines.forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var label = '', mm = line.match(/^(.*)(?:\s+:\s+|\s*：\s*)(.+)$/);
      if (mm) { line = mm[1]; label = mm[2].trim(); }
      var ids = line.split(/\s*(?:->|→)\s*/).filter(Boolean).map(function (t) { return add(parseToken(t)); });
      for (var i = 0; i + 1 < ids.length; i++) {
        edges.push({ from: ids[i], to: ids[i + 1], label: i === ids.length - 2 ? label : '' });
      }
    });
    return { nodes: nodes, order: order, edges: edges };
  }

  // ② 配置: 層(上から下) を決める。ループの戻り辺は別扱い
  function layout(g) {
    var out = {}, state = {};
    g.order.forEach(function (id) { out[id] = []; });
    g.edges.forEach(function (e) { out[e.from].push(e); });
    var hasIn = {};
    g.edges.forEach(function (e) { hasIn[e.to] = true; });
    var starts = g.order.filter(function (id) { return !hasIn[id]; });
    if (!starts.length && g.order.length) starts = [g.order[0]];
    // DFSで「戻り辺」(ループ)を見つける
    function dfs(id) {
      state[id] = 1;
      out[id].forEach(function (e) {
        if (state[e.to] === 1) e.back = true;
        else if (!state[e.to]) dfs(e.to);
      });
      state[id] = 2;
    }
    starts.concat(g.order).forEach(function (id) { if (!state[id]) dfs(id); });
    // 戻り辺を除いた図で、最長経路の深さ = 層
    var preds = {}, layer = {};
    g.order.forEach(function (id) { preds[id] = []; });
    g.edges.forEach(function (e) { if (!e.back && e.from !== e.to) preds[e.to].push(e.from); });
    function depth(id) {
      if (layer[id] != null) return layer[id];
      layer[id] = 0;
      var d = 0;
      preds[id].forEach(function (p) { d = Math.max(d, depth(p) + 1); });
      return (layer[id] = d);
    }
    g.order.forEach(depth);
    var layers = [];
    g.order.forEach(function (id) { (layers[layer[id]] = layers[layer[id]] || []).push(id); });
    return { layer: layer, layers: layers };
  }

  function textWidth(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? CHAR_W : CHAR_W * 0.62;
    return w;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ③ 描画: SVG文字列を作る
  function render(src, opts) {
    opts = opts || {};
    var stroke = opts.stroke || '#007AFF', fill = opts.fill || '#FFFFFF', ink = opts.ink || '#1C1C1E';
    var g = parse(src);
    if (!g.order.length) return { svg: '', width: 0, height: 0, nodes: {}, edges: [] };
    var L = layout(g);

    g.order.forEach(function (id) {
      var n = g.nodes[id], w = Math.max(72, textWidth(n.text) + 28);
      n.w = n.shape === 'diamond' ? w * 1.5 : w;
      n.h = n.shape === 'diamond' ? DIA_H : NODE_H;
    });
    // 各層を中央寄せ。前の層での平均位置で並べ替え(線の交差を減らす簡易版)
    var rows = L.layers, rowW = [], maxW = 0;
    rows.forEach(function (ids) {
      var w = -GAP_X; ids.forEach(function (id) { w += g.nodes[id].w + GAP_X; });
      rowW.push(w); maxW = Math.max(maxW, w);
    });
    var backCount = g.edges.filter(function (e) { return e.back; }).length;
    var backMargin = backCount ? 28 + backCount * 14 : 0;
    var y = PAD, centerX = PAD + maxW / 2;
    rows.forEach(function (ids, r) {
      if (r > 0) {
        var prev = rows[r - 1];
        ids.sort(function (a, b) { return bary(a) - bary(b); });
        function bary(id) {
          var xs = g.edges.filter(function (e) { return e.to === id && !e.back && prev.indexOf(e.from) >= 0; })
            .map(function (e) { return g.nodes[e.from].x; });
          return xs.length ? xs.reduce(function (s, v) { return s + v; }, 0) / xs.length : 1e9;
        }
      }
      var x = centerX - rowW[r] / 2, rh = 0;
      ids.forEach(function (id) { var n = g.nodes[id]; n.x = x + n.w / 2; x += n.w + GAP_X; rh = Math.max(rh, n.h); });
      ids.forEach(function (id) { g.nodes[id].y = y + rh / 2; });
      y += rh + GAP_Y;
    });
    var width = maxW + PAD * 2 + backMargin, height = y - GAP_Y + PAD;
    var rightEdge = PAD + maxW;

    var p = [];
    p.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height +
      '" font-family="-apple-system,\'Hiragino Sans\',\'Noto Sans JP\',sans-serif" font-size="13">');
    p.push('<defs><marker id="fr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="' + stroke + '"/></marker></defs>');

    var backIdx = 0;
    g.edges.forEach(function (e) {
      var a = g.nodes[e.from], b = g.nodes[e.to], d, lx, ly;
      if (e.from === e.to) { return; }
      if (e.back) {
        var off = rightEdge + 18 + (backIdx++) * 14;
        var x1 = a.x + a.w / 2, x2 = b.x + b.w / 2;
        d = 'M' + x1 + ' ' + a.y + ' H' + off + ' V' + b.y + ' H' + x2;
        lx = off + 4; ly = (a.y + b.y) / 2;
      } else {
        var x1b = a.x, y1 = a.y + a.h / 2, x2b = b.x, y2 = b.y - b.h / 2;
        d = 'M' + x1b + ' ' + y1 + ' L' + x2b + ' ' + y2;
        lx = (x1b + x2b) / 2 + 6; ly = (y1 + y2) / 2;
      }
      p.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.6" marker-end="url(#fr-arrow)"/>');
      if (e.label) p.push('<text x="' + lx + '" y="' + ly + '" fill="' + ink + '" stroke="' + fill + '" stroke-width="4" paint-order="stroke" font-size="12">' + esc(e.label) + '</text>');
    });
    g.order.forEach(function (id) {
      var n = g.nodes[id], x = n.x - n.w / 2, yy = n.y - n.h / 2;
      var common = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.8"';
      if (n.shape === 'diamond')
        p.push('<polygon points="' + n.x + ',' + yy + ' ' + (n.x + n.w / 2) + ',' + n.y + ' ' + n.x + ',' + (yy + n.h) + ' ' + x + ',' + n.y + '"' + common + '/>');
      else
        p.push('<rect x="' + x + '" y="' + yy + '" width="' + n.w + '" height="' + n.h + '" rx="' + (n.shape === 'pill' ? n.h / 2 : 8) + '"' + common + '/>');
      p.push('<text x="' + n.x + '" y="' + (n.y + 4.5) + '" text-anchor="middle" fill="' + ink + '">' + esc(n.text) + '</text>');
    });
    p.push('</svg>');
    return { svg: p.join(''), width: width, height: height, nodes: g.nodes, edges: g.edges };
  }

  function searchText(src) { var g = parse(src); return g.order.concat(g.edges.map(function (e) { return e.label; }).filter(Boolean)).join(' '); }

  var api = { parse: parse, render: render, searchText: searchText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlowRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
