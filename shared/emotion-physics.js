/**
 * emotion-physics.js
 * 感情の物理モデル — 共有モジュール
 * flow-mind エコシステム全アプリで使用
 *
 * 使い方:
 *   <script src="https://norinori-jan.github.io/flow-mind/shared/emotion-physics.js"></script>
 *   const ep = window.EmotionPhysics;
 *
 * バージョン: 1.1.0
 * 変更履歴:
 *   1.1.0 - detectSyncClusters の density 計算バグを修正
 *           （分母がグラフ全体のノード数 → 現在アクティブなノード数に修正。
 *             flow-mind本体(index.html)のロジックと一致させた）
 *         - fireNode 内の到達しない死んだコードを削除
 *         - ブリッジからの自動送信専用キー is_emotion_transfer を追加
 *           （quick-refの「全データ一括転送」ボタン等が使う is_transfer との
 *             書き込み競合を避けるため）
 */
(function(global) {
  'use strict';

  // ══════════════════════════════════════
  // 定数
  // ══════════════════════════════════════

  /** ① 電荷の減衰時定数 (ms) */
  const CHARGE_DECAY_TAU = 4000;

  /** ① 発火時の電荷ブースト量 */
  const FIRE_CHARGE_BOOST = 0.7;

  /** ② 電荷伝播係数（電流→電場・磁場のアナロジー） */
  const PROPAGATION_FACTOR = 0.42;

  /** ① Hebbian強化幅（同時発火でconductanceが増加する量） */
  const HEBBIAN_STEP = 0.04;

  /** ③ 同期検出の時間窓 (ms) */
  const SYNC_WINDOW_MS = 2200;

  /** ③ 周波数帯しきい値 (Hz相当) */
  const BAND_THRESH = { gamma: 30, beta: 13, alpha: 8, theta: 4 };

  /** ③ 帯域スタイル定義 */
  const BAND_STYLE = {
    gamma: { color: '#FF5F5F', speed: 1.0,  label: 'γ波（怒り・集中）',   hz: '30–80Hz' },
    beta:  { color: '#FB923C', speed: 0.7,  label: 'β波（思考・緊張）',   hz: '13–30Hz' },
    alpha: { color: '#4AE09A', speed: 0.45, label: 'α波（リラックス）',   hz: '8–12Hz'  },
    theta: { color: '#C084FC', speed: 0.3,  label: 'θ波（不安・記憶）',   hz: '4–7Hz'   },
    delta: { color: '#4A9EFF', speed: 0.18, label: 'δ波（深い情動・睡眠）', hz: '0.5–4Hz' },
  };

  /** ④ attractor判定テーブル */
  const ATTRACTOR_TABLE = {
    gamma: [
      { density: 0.6, durationMs: 2800, label: '怒り' },
      { density: 0,   durationMs: 0,    label: '集中' },
    ],
    beta: [
      { density: 0, durationMs: 3000, label: '緊張' },
      { density: 0, durationMs: 0,    label: '思考中' },
    ],
    alpha: [
      { density: 0, durationMs: 0, label: 'リラックス' },
    ],
    theta: [
      { density: 0.5, durationMs: 0, label: '不安' },
      { density: 0,   durationMs: 0, label: '想起' },
    ],
    delta: [
      { density: 0, durationMs: 5000, label: '深い情動' },
    ],
  };

  // ══════════════════════════════════════
  // ① ② 電荷・伝播
  // ══════════════════════════════════════

  /** ノードに物理フィールドがなければ初期化 */
  function ensureNode(n) {
    if (n.charge      === undefined) n.charge      = 0;
    if (!n.fireHistory)              n.fireHistory  = [];
    if (n.lastFired   === undefined) n.lastFired    = 0;
    return n;
  }

  /** エッジに伝導率フィールドがなければ初期化 */
  function ensureEdge(e) {
    if (e.conductance === undefined) e.conductance = 1.0;
    return e;
  }

  /**
   * ① ノードを発火させる（タップ = 活動電位）
   * @param {string} nodeId
   * @param {{ nodes: Object, edges: Array }} graph
   */
  function fireNode(nodeId, graph) {
    const n = graph.nodes[nodeId];
    if (!n) return;
    ensureNode(n);
    const now = Date.now();
    n.fireHistory.push(now);
    if (n.fireHistory.length > 8) n.fireHistory.shift();
    n.lastFired = now;
    n.charge = Math.min(1, n.charge + FIRE_CHARGE_BOOST);

    // ② 電流 → 隣接ノードへ伝播（有向グラフ: fromからtoへのみ）
    graph.edges.forEach(e => {
      ensureEdge(e);
      if (e.from !== nodeId) return;
      const other = graph.nodes[e.to];
      if (!other) return;
      ensureNode(other);
      const transferred = n.charge * (e.weight || 1) * e.conductance * PROPAGATION_FACTOR;
      other.charge = Math.min(1, other.charge + transferred);
      // Hebbian: 同時発火でconductance強化
      if (other.lastFired && (now - other.lastFired < SYNC_WINDOW_MS)) {
        e.conductance = Math.min(2, e.conductance + HEBBIAN_STEP);
      }
    });
  }

  /**
   * ① 全ノードの電荷を時間経過で減衰させる
   * @param {{ nodes: Object }} graph
   * @param {number} dtMs 経過時間(ms)
   */
  function decayCharges(graph, dtMs) {
    const factor = Math.exp(-dtMs / CHARGE_DECAY_TAU);
    Object.values(graph.nodes).forEach(n => {
      if (n.charge) {
        n.charge *= factor;
        if (n.charge < 0.01) n.charge = 0;
      }
    });
  }

  // ══════════════════════════════════════
  // ③ 周波数帯推定・同期クラスタ検出
  // ══════════════════════════════════════

  /**
   * ③ ノードの発火履歴から周波数帯を推定
   * @param {{ fireHistory: number[] }} n
   * @returns {'gamma'|'beta'|'alpha'|'theta'|'delta'|null}
   */
  function estimateFreqBand(n) {
    const h = n.fireHistory;
    if (!h || h.length < 2) return null;
    const recent = h.slice(-4);
    let total = 0, cnt = 0;
    for (let i = 1; i < recent.length; i++) { total += recent[i] - recent[i-1]; cnt++; }
    if (!cnt) return null;
    const hz = 1000 / (total / cnt);
    if (hz >= BAND_THRESH.gamma) return 'gamma';
    if (hz >= BAND_THRESH.beta)  return 'beta';
    if (hz >= BAND_THRESH.alpha) return 'alpha';
    if (hz >= BAND_THRESH.theta) return 'theta';
    return 'delta';
  }

  /**
   * ③ 時間窓内に同時発火している連結ノード群をクラスタ化
   *
   * density は「現在アクティブなノードのうち、このクラスタが占める割合」。
   * グラフ全体のノード数を分母にすると、グラフが育つほどdensityが下がり
   * attractorが検出されなくなってしまうため、flow-mind本体(index.html)と
   * 同じ基準（アクティブノード数）に合わせている。
   *
   * @param {{ nodes: Object, edges: Array }} graph
   * @returns {Array<{ nodeIds, band, density, durationMs, size }>}
   */
  function detectSyncClusters(graph) {
    const now = Date.now();
    const nids = Object.keys(graph.nodes);
    const activeIds = nids.filter(id => {
      const n = graph.nodes[id];
      return n.lastFired && (now - n.lastFired < SYNC_WINDOW_MS);
    });
    if (activeIds.length === 0) return [];

    // 隣接マップ（アクティブノード間のみ）
    const adj = {};
    activeIds.forEach(id => adj[id] = []);
    graph.edges.forEach(e => {
      if (adj[e.from] !== undefined && activeIds.includes(e.to))  adj[e.from].push(e.to);
      if (adj[e.to]   !== undefined && activeIds.includes(e.from)) adj[e.to].push(e.from);
    });

    // 連結成分
    const visited = new Set();
    const clusters = [];
    activeIds.forEach(start => {
      if (visited.has(start)) return;
      const stack = [start], comp = [];
      while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur); comp.push(cur);
        (adj[cur] || []).forEach(nb => { if (!visited.has(nb)) stack.push(nb); });
      }
      if (!comp.length) return;

      // 帯域を多数決で決定
      const bandCounts = {};
      let earliest = Infinity, latest = 0;
      comp.forEach(id => {
        const n = graph.nodes[id];
        const band = estimateFreqBand(n) || 'delta';
        bandCounts[band] = (bandCounts[band] || 0) + 1;
        if (n.fireHistory && n.fireHistory[0]) earliest = Math.min(earliest, n.fireHistory[0]);
        latest = Math.max(latest, n.lastFired || 0);
      });
      const band = Object.entries(bandCounts).sort((a, b) => b[1] - a[1])[0][0];

      clusters.push({
        nodeIds:    comp,
        band,
        bandCounts,
        density:    comp.length / activeIds.length, // ← 修正: activeIds基準
        durationMs: isFinite(earliest) ? latest - earliest : 0,
        size:       comp.length,
      });
    });

    return clusters.filter(c => c.size >= 2);
  }

  // ══════════════════════════════════════
  // ④ Attractor 判定
  // ══════════════════════════════════════

  /**
   * ④ クラスタからattractor（感情状態）を判定
   * @param {{ band, density, durationMs, size }} cluster
   * @returns {{ label: string, color: string }|null}
   */
  function classifyAttractor(cluster) {
    const { band, density, durationMs, size } = cluster;
    if (size < 2) return null;
    const rules = ATTRACTOR_TABLE[band] || [];
    for (const rule of rules) {
      if (density >= rule.density && durationMs >= rule.durationMs) {
        return { label: rule.label, color: BAND_STYLE[band].color, band };
      }
    }
    return null;
  }

  /**
   * ④ グラフ全体の現在のattractorを取得（最大クラスタを代表に使用）
   * @param {{ nodes: Object, edges: Array }} graph
   * @returns {{ attractor, clusters, mainCluster }}
   */
  function getGraphAttractorState(graph) {
    const clusters = detectSyncClusters(graph);
    if (!clusters.length) return { attractor: null, clusters: [], mainCluster: null };
    const main = clusters.slice().sort((a, b) => b.size - a.size)[0];
    return {
      attractor:   classifyAttractor(main),
      clusters,
      mainCluster: main,
    };
  }

  // ══════════════════════════════════════
  // AI コンテキストビルダー
  // ══════════════════════════════════════

  /**
   * AI本音抽出用のattractorコンテキスト文字列を生成
   * @param {Array} clusters
   * @param {{ nodes: Object }} graph
   * @returns {string}
   */
  function buildAttractorContext(clusters, graph) {
    if (!clusters || !clusters.length) {
      return '現在、同期している（活性化している）ノード群はありません。';
    }
    const lines = clusters.map(c => {
      const attr  = classifyAttractor(c);
      const style = BAND_STYLE[c.band];
      const labels = c.nodeIds.map(id => graph.nodes[id]?.label || '?').join('、');
      return `・帯域: ${style.label} / 持続: ${Math.round(c.durationMs)}ms / 密度: ${Math.round(c.density * 100)}%\n` +
             `  関与ノード: ${labels}\n` +
             `  推定attractor: ${attr ? attr.label : '未収束（過渡状態）'}`;
    });
    return `現在、以下の神経同期パターンが検出されています：\n${lines.join('\n\n')}`;
  }

  // ══════════════════════════════════════
  // is_transfer プロトコル
  // ══════════════════════════════════════

  /** ユーザーが明示的に行う「全データ一括転送」用（quick-refの設定画面など） */
  const LS_TRANSFER = 'is_transfer';
  /** ブリッジが保存のたびに自動送信する感情メタデータ専用キー（is_transferと競合させない） */
  const LS_EMOTION_TRANSFER = 'is_emotion_transfer';
  const LS_GRAPHS   = 'fm_graphs';
  const LS_CURRENT  = 'fm_current';

  /**
   * 感情メタデータ付きで is_emotion_transfer に書き込む（ブリッジからの自動送信用）
   * 手動の全データ一括転送(is_transfer)とは別キーなので上書き事故が起きない。
   * @param {string} source アプリ名
   * @param {Array<{ id, title, body, [key]: any }>} items
   * @param {{ attractor, band, timestamp }|null} emotionMeta
   */
  function writeTransfer(source, items, emotionMeta = null) {
    const payload = {
      source,
      items,
      emotionMeta: emotionMeta || null,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(LS_EMOTION_TRANSFER, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('[EmotionPhysics] writeTransfer failed:', e);
      return false;
    }
  }

  /**
   * flow-mindの現在のattractor状態をlocalStorageから読む
   * （flow-mindが同じorigin上で動いている場合のみ動作。
   *   GitHub Pagesのユーザーサイト配下は norinori-jan.github.io が共通originなので、
   *   flow-mind/quick-ref/vocal-lab等の別リポジトリでも読み書き可能）
   * @returns {{ attractor, band, graphName }|null}
   */
  function readFlowMindAttractor() {
    try {
      const raw = localStorage.getItem(LS_GRAPHS);
      if (!raw) return null;
      const graphs = JSON.parse(raw);
      const curId  = localStorage.getItem(LS_CURRENT);
      const g = graphs[curId];
      if (!g) return null;
      const state = getGraphAttractorState(g);
      return {
        attractor: state.attractor,
        band:      state.mainCluster?.band || null,
        graphName: g.name,
        nodeCount: Object.keys(g.nodes || {}).length,
      };
    } catch {
      return null;
    }
  }

  // ══════════════════════════════════════
  // テキスト感情推定（quick-ref向け簡易版）
  // ══════════════════════════════════════

  const EMOTION_KEYWORDS = {
    gamma: ['怒り', '怒る', '許せない', '腹立', 'イライラ', '集中', '没頭', 'やり切', '闘志', '戦う', '負けない'],
    beta:  ['考え', '思考', '分析', '検討', '緊張', '不安定', 'プレッシャー', 'ストレス', '焦り', '迷い'],
    alpha: ['落ち着', 'リラックス', '平和', '穏やか', 'ゆっくり', '安心', '余裕', '楽しい', '満足'],
    theta: ['不安', '怖い', '心配', '悲しい', '孤独', '思い出', '懐かし', '夢', '記憶', 'ぼんやり'],
    delta: ['眠い', '疲れ', '深い', '静か', '沈む', '虚無', 'だるい', '消えたい', '休みたい'],
  };

  /**
   * テキストから感情帯域を推定（簡易キーワードマッチ）
   * HTMLタグは呼び出し側で除去してから渡すこと（quick-refのbodyはcontenteditable由来のHTML文字列）
   * @param {string} text
   * @returns {{ band: string, score: number, color: string, label: string }|null}
   */
  function estimateBandFromText(text) {
    if (!text) return null;
    const counts = {};
    Object.entries(EMOTION_KEYWORDS).forEach(([band, words]) => {
      counts[band] = words.filter(w => text.includes(w)).length;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] === 0) return null;
    const band = sorted[0][0];
    return { band, score: sorted[0][1], ...BAND_STYLE[band] };
  }

  // ══════════════════════════════════════
  // BPM / コード → 帯域マッピング（score-editor向け）
  // ══════════════════════════════════════

  /**
   * BPMから感情帯域を推定
   * @param {number} bpm
   * @returns {string} band name
   */
  function bandFromBpm(bpm) {
    if (bpm >= 160) return 'gamma';
    if (bpm >= 120) return 'beta';
    if (bpm >= 80)  return 'alpha';
    if (bpm >= 60)  return 'theta';
    return 'delta';
  }

  /**
   * コード種別から感情帯域を推定
   * @param {'major'|'minor'|'dim'|'aug'|'sus'} chordType
   * @returns {string} band name
   */
  function bandFromChord(chordType) {
    const map = {
      major: 'alpha', minor: 'theta', dim: 'gamma',
      aug: 'gamma', sus: 'beta', dom7: 'beta',
    };
    return map[chordType] || 'alpha';
  }

  /**
   * BPMとコードを合成して帯域を決定
   * @param {number} bpm
   * @param {string} chordType
   * @returns {{ band, style }}
   */
  function bandFromMusicParams(bpm, chordType) {
    const bpmBand   = bandFromBpm(bpm);
    const chordBand = bandFromChord(chordType);
    // BPMを優先しつつコードで±1段階補正
    const order = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    const bpmIdx   = order.indexOf(bpmBand);
    const chordIdx = order.indexOf(chordBand);
    const idx = Math.round((bpmIdx * 2 + chordIdx) / 3); // BPM優先の重み付き平均
    const band = order[Math.max(0, Math.min(4, idx))];
    return { band, style: BAND_STYLE[band] };
  }

  // ══════════════════════════════════════
  // 音声エネルギー → 帯域マッピング（vocal-lab向け）
  // ══════════════════════════════════════

  /**
   * 音声の特徴量から感情帯域を推定
   * @param {{ rms: number, pitch: number, tempo: number }} features
   *   rms: 音量 (0-1), pitch: 平均ピッチHz, tempo: 発話速度(音節/秒)
   * @returns {{ band, style }}
   */
  function bandFromVoiceFeatures({ rms = 0.5, pitch = 200, tempo = 4 }) {
    const energyScore = rms;                     // 0-1
    const pitchScore  = Math.min(1, pitch / 400); // 0-1 (400Hz上限)
    const tempoScore  = Math.min(1, tempo / 8);   // 0-1 (8音節/秒上限)
    const combined = (energyScore + pitchScore + tempoScore) / 3;

    if (combined >= 0.75) return { band: 'gamma', style: BAND_STYLE.gamma };
    if (combined >= 0.55) return { band: 'beta',  style: BAND_STYLE.beta  };
    if (combined >= 0.40) return { band: 'alpha', style: BAND_STYLE.alpha };
    if (combined >= 0.25) return { band: 'theta', style: BAND_STYLE.theta };
    return { band: 'delta', style: BAND_STYLE.delta };
  }

  // ══════════════════════════════════════
  // Public API
  // ══════════════════════════════════════

  global.EmotionPhysics = {
    // 定数
    BAND_STYLE,
    BAND_THRESH,
    SYNC_WINDOW_MS,
    CHARGE_DECAY_TAU,
    LS_TRANSFER,
    LS_EMOTION_TRANSFER,
    LS_GRAPHS,
    LS_CURRENT,

    // ① ② 電荷・伝播
    ensureNode,
    ensureEdge,
    fireNode,
    decayCharges,

    // ③ 同期検出
    estimateFreqBand,
    detectSyncClusters,

    // ④ Attractor
    classifyAttractor,
    getGraphAttractorState,

    // AI
    buildAttractorContext,

    // is_transfer
    writeTransfer,
    readFlowMindAttractor,

    // テキスト推定
    estimateBandFromText,

    // 音楽パラメータ
    bandFromBpm,
    bandFromChord,
    bandFromMusicParams,

    // 音声特徴量
    bandFromVoiceFeatures,
  };

})(window);

