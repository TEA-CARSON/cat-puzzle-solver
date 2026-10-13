/*
 * Queens（Star Battle 1 星）解題引擎
 * 規則：每個色塊 1 隻、每橫列 1 隻、每直行 1 隻、任兩隻不可相鄰（含斜角）。
 *
 * 盤面表示：
 *   N        棋盤邊長
 *   regions  長度 N*N 的陣列，每格的色塊編號 0..N-1
 *   state    長度 N*N 的陣列，0 = 未知、1 = 打叉、2 = 貓
 *
 * 瀏覽器與 Node 皆可使用（window.QueensEngine / module.exports）。
 */
(function (global) {
  'use strict';

  const EMPTY = 0, CROSS = 1, CAT = 2;

  function validate(N, regions) {
    if (!Number.isInteger(N) || N < 4 || N > 16) return '棋盤大小需介於 4 到 16';
    if (!regions || regions.length !== N * N) return '色塊資料長度不符';
    const seen = new Array(N).fill(0);
    for (const g of regions) {
      if (!Number.isInteger(g) || g < 0) return '還有格子沒有指定色塊';
      if (g >= N) return `色塊編號超出範圍（${N}×${N} 只能有 ${N} 種顏色）`;
      seen[g]++;
    }
    const missing = seen.filter((c) => c === 0).length;
    if (missing) return `需要剛好 ${N} 種顏色，目前只有 ${N - missing} 種`;
    return null;
  }

  // 建立盤面的預先計算資料
  function create(N, regions) {
    const n = N * N;
    const row = new Int8Array(n), col = new Int8Array(n);
    for (let i = 0; i < n; i++) { row[i] = (i / N) | 0; col[i] = i % N; }

    // 單位索引：0..N-1 橫列、N..2N-1 直行、2N..3N-1 色塊
    const units = [];
    for (let r = 0; r < N; r++) units.push({ type: 'row', id: r, cells: [] });
    for (let c = 0; c < N; c++) units.push({ type: 'col', id: c, cells: [] });
    for (let g = 0; g < N; g++) units.push({ type: 'region', id: g, cells: [] });
    for (let i = 0; i < n; i++) {
      units[row[i]].cells.push(i);
      units[N + col[i]].cells.push(i);
      units[2 * N + regions[i]].cells.push(i);
    }

    // attacks[i]：若 i 放貓，哪些格子就不能放
    const attacks = [];
    for (let i = 0; i < n; i++) {
      const list = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (row[i] === row[j] || col[i] === col[j] || regions[i] === regions[j] ||
            (Math.abs(row[i] - row[j]) <= 1 && Math.abs(col[i] - col[j]) <= 1)) list.push(j);
      }
      attacks.push(list);
    }

    const regionMaxRow = new Array(N).fill(-1);
    for (let i = 0; i < n; i++) regionMaxRow[regions[i]] = Math.max(regionMaxRow[regions[i]], row[i]);

    return { N, n, regions: Array.from(regions), row, col, units, attacks, regionMaxRow };
  }

  function unitOf(p, type, i) {
    if (type === 'row') return p.row[i];
    if (type === 'col') return p.N + p.col[i];
    return 2 * p.N + p.regions[i];
  }

  // 回溯法解題；回傳最多 limit 組解，每組解為貓所在的格子索引陣列
  function solve(p, state, limit = 2) {
    const { N, regions, regionMaxRow } = p;
    state = state || new Array(p.n).fill(EMPTY);
    const sols = [];
    const colUsed = new Uint8Array(N), regUsed = new Uint8Array(N);
    const pick = new Array(N);

    function rec(r, prevC) {
      if (r === N) { sols.push(pick.map((c, rr) => rr * N + c)); return sols.length >= limit; }
      // 剪枝：所有格子都在已處理列之上的色塊卻還沒放貓 → 死路
      for (let g = 0; g < N; g++) if (!regUsed[g] && regionMaxRow[g] < r) return false;

      let forced = -1, cats = 0;
      for (let c = 0; c < N; c++) if (state[r * N + c] === CAT) { forced = c; cats++; }
      if (cats > 1) return false;

      for (let c = 0; c < N; c++) {
        if (forced >= 0 && c !== forced) continue;
        const i = r * N + c;
        if (state[i] === CROSS || colUsed[c] || regUsed[regions[i]]) continue;
        if (prevC >= 0 && Math.abs(c - prevC) <= 1) continue;
        colUsed[c] = 1; regUsed[regions[i]] = 1; pick[r] = c;
        if (rec(r + 1, c)) return true;
        colUsed[c] = 0; regUsed[regions[i]] = 0;
      }
      return false;
    }
    rec(0, -1);
    return sols;
  }

  // 每個單位目前的貓與候選格
  function analyze(p, state) {
    return p.units.map((u) => {
      let cat = -1;
      const cands = [];
      for (const i of u.cells) {
        if (state[i] === CAT) cat = i;
        else if (state[i] === EMPTY) cands.push(i);
      }
      return { cat, cands };
    });
  }

  // 單位依「色塊 → 橫列 → 直行」排序，提示時優先用色塊說明（最直覺）
  function unitOrder(p) {
    const N = p.N, order = [];
    for (let u = 2 * N; u < 3 * N; u++) order.push(u);
    for (let u = 0; u < 2 * N; u++) order.push(u);
    return order;
  }

  const TYPE_NAME = { row: '橫列', col: '直行', region: '色塊' };

  // level：這一步推理的難度，產生器用來評估關卡難度（0 = 機械性步驟、10 = 推理不出來）
  const TECH_LEVEL = {
    catElim: 0, single: 1, confine1: 2, shared: 3, confine2: 4, confine3: 5,
    tryOne: 6, tryChain: 7, confine4: 7, reveal: 10,
  };

  // 顯示給玩家看的技巧名稱（白話）；區域鎖定依單位種類另外組名稱
  const TECH_LABEL = {
    catElim: '放貓後打叉', single: '只剩一格', shared: '怎麼放都擋到',
    tryOne: '試放看看', tryChain: '試放連鎖推演', reveal: '直接揭曉',
    mistake: '標記錯誤', nosolution: '無解', solved: '完成',
  };

  // reason 是 token 陣列：字串（'\n' 代表換行）、{ cell }、{ unit }、{ fold, summary }（可展開的摺疊區塊）
  function hint(kind, id, cells, focus, reason, label) {
    return { kind, id, technique: label || TECH_LABEL[id], level: TECH_LEVEL[id] || 0, cells, focus: focus || [], reason };
  }

  function joinCells(cells) {
    const out = [];
    cells.forEach((c, idx) => { if (idx) out.push('、'); out.push({ cell: c }); });
    return out;
  }

  // i 放貓為什麼會排除 j：同橫列／直行優先，其次同色塊，都不是就一定是斜角相鄰
  const RELATIONS = ['row', 'col', 'region', 'diag'];
  const RELATION_TEXT = {
    row: ' 跟它在同一橫列', col: ' 跟它在同一直行', region: ' 跟它在同一個色塊', diag: ' 是它的斜角鄰格',
  };
  function relation(p, i, j) {
    if (p.row[i] === p.row[j]) return 'row';
    if (p.col[i] === p.col[j]) return 'col';
    if (p.regions[i] === p.regions[j]) return 'region';
    return 'diag';
  }

  // 說明 i 放貓時，targets 各自是因為什麼關係被排除；key 用來合併說法相同的候選格
  function describeAttack(p, i, targets) {
    const tokens = [];
    const key = [];
    for (const rel of RELATIONS) {
      const group = targets.filter((j) => relation(p, i, j) === rel);
      if (!group.length) continue;
      if (tokens.length) tokens.push('，');
      tokens.push(...joinCells(group), RELATION_TEXT[rel]);
      key.push(rel + ':' + group.join(','));
    }
    return { tokens, key: key.join('|') };
  }

  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const stepNo = (k) => (k <= CIRCLED.length ? CIRCLED[k - 1] : `${k}.`) + ' ';
  const FOLD_AFTER = 4; // 推演超過幾步就把中間摺疊起來

  // ---- 推理技巧 ----

  // 已放的貓會排除同列、同行、同色塊與周圍 8 格
  function catConsequences(p, state) {
    for (let i = 0; i < p.n; i++) {
      if (state[i] !== CAT) continue;
      const elim = p.attacks[i].filter((j) => state[j] === EMPTY);
      if (elim.length) {
        return hint('eliminate', 'catElim', elim, [i],
          ['貓咪在 ', { cell: i }, '，同一橫列、直行、色塊，以及周圍 8 格都不能再放貓',
            `\n→ 這些格子打叉（共 ${elim.length} 格）`]);
      }
    }
    return null;
  }

  // 某單位只剩一格
  function singles(p, state, info) {
    for (const u of unitOrder(p)) {
      if (info[u].cat < 0 && info[u].cands.length === 1) {
        const i = info[u].cands[0];
        return hint('place', 'single', [i], p.units[u].cells,
          [{ unit: u }, ' 只剩 ', { cell: i }, ' 這一格可以放貓', '\n→ 放貓']);
      }
    }
    return null;
  }

  // k 個 A 單位的候選格全落在 k 個 B 單位內 → B 單位其餘格子打叉
  const CONFINE_PAIRS = [
    ['region', 'row'], ['region', 'col'], ['row', 'region'],
    ['col', 'region'], ['row', 'col'], ['col', 'row'],
  ];

  function confinement(p, state, info, k) {
    const N = p.N;
    for (const [ta, tb] of CONFINE_PAIRS) {
      const base = ta === 'row' ? 0 : ta === 'col' ? N : 2 * N;
      const bBase = tb === 'row' ? 0 : tb === 'col' ? N : 2 * N;
      const As = [];
      for (let u = base; u < base + N; u++) if (info[u].cat < 0) As.push(u);
      if (As.length <= k) continue;

      const masks = As.map((u) => {
        let m = 0;
        for (const i of info[u].cands) m |= 1 << (unitOf(p, tb, i) - bBase);
        return m;
      });

      const pickIdx = [];
      let found = null;
      (function combo(start, mask) {
        if (found) return;
        if (pickIdx.length === k) {
          if (popcount(mask) !== k) return;
          const S = new Set(pickIdx.map((x) => As[x]));
          const elim = [];
          for (let i = 0; i < p.n; i++) {
            if (state[i] !== EMPTY) continue;
            if (!(mask & (1 << (unitOf(p, tb, i) - bBase)))) continue;
            if (S.has(unitOf(p, ta, i))) continue;
            elim.push(i);
          }
          if (!elim.length) return;
          const aUnits = [...S];
          const bUnits = [];
          for (let b = 0; b < N; b++) if (mask & (1 << b)) bUnits.push(bBase + b);
          const focus = aUnits.flatMap((u) => info[u].cands);
          const TA = TYPE_NAME[ta], TB = TYPE_NAME[tb];
          const total = elim.length > 2 ? `（共 ${elim.length} 格）` : '';
          let reason, label;
          if (k === 1) {
            label = `${TA}包下整個${TB}`;
            reason = [{ unit: aUnits[0] }, ' 能放貓的格子全都在 ', { unit: bUnits[0] }, ' 裡',
              '\n→ ', { unit: bUnits[0] }, ' 的貓一定是 ', { unit: aUnits[0] }, ' 的那一隻',
              '\n→ 打叉：', { unit: bUnits[0] }, ' 裡其他的格子 ', ...joinCells(elim), total];
          } else {
            label = `${k} 個${TA}包下 ${k} 個${TB}`;
            reason = [...joinTokens(aUnits), ` 這 ${k} 個${TA}能放貓的格子，全都在 `,
              ...joinTokens(bUnits), ` 這 ${k} 個${TB}裡`,
              `\n→ 這 ${k} 個${TB}的 ${k} 隻貓會被它們佔滿`,
              `\n→ 打叉：這些${TB}裡其他${TA}的格子 `, ...joinCells(elim), total];
          }
          found = hint('eliminate', `confine${k}`, elim, focus, reason, label);
          return;
        }
        for (let x = start; x < As.length; x++) {
          const nm = mask | masks[x];
          if (popcount(nm) > k) continue;
          pickIdx.push(x);
          combo(x + 1, nm);
          pickIdx.pop();
          if (found) return;
        }
      })(0, 0);
      if (found) return found;
    }
    return null;
  }

  // 不論某單位的貓放哪一格，都會排除的格子
  function sharedAttack(p, state, info) {
    for (const u of unitOrder(p)) {
      const cands = info[u].cands;
      if (info[u].cat >= 0 || cands.length < 2) continue;
      const count = new Uint8Array(p.n);
      for (const c of cands) for (const j of p.attacks[c]) count[j]++;
      const elim = [];
      for (let j = 0; j < p.n; j++) if (count[j] === cands.length && state[j] === EMPTY) elim.push(j);
      if (elim.length) {
        // 每個候選格各自說明為什麼會排除這些格子，說法相同的合併成一行
        const groups = new Map();
        for (const c of cands) {
          const d = describeAttack(p, c, elim);
          if (!groups.has(d.key)) groups.set(d.key, { cands: [], tokens: d.tokens });
          groups.get(d.key).cands.push(c);
        }
        const reason = [{ unit: u }, ' 的貓只能放在 ', ...joinCells(cands), '，不管放哪一格，',
          ...joinCells(elim), ' 都會被排除：'];
        for (const g of groups.values()) reason.push('\n・放 ', ...joinCells(g.cands), '：', ...g.tokens);
        reason.push('\n→ 打叉：', ...joinCells(elim));
        return hint('eliminate', 'shared', elim, cands, reason);
      }
    }
    return null;
  }

  function placeCat(p, s, i) {
    s[i] = CAT;
    for (const j of p.attacks[i]) if (s[j] === EMPTY) s[j] = CROSS;
  }

  function emptyUnit(p, s, order) {
    const info = analyze(p, s);
    for (const u of order) if (info[u].cat < 0 && info[u].cands.length === 0) return u;
    return -1;
  }

  // 假設 i 放貓並往下推。deep 為 false 時只看這隻貓直接排除的格子；
  // 為 true 時持續把「只剩一格」的單位放貓（只用強制步驟，不做窮舉）。
  // 回傳 { unit, steps }：unit 為變成無處可放的單位，steps 為依序放下的貓 [{ unit, cell }]；沒有矛盾回傳 null
  function propagate(p, state, i, deep, order) {
    const s = Array.from(state);
    const steps = [];
    placeCat(p, s, i);
    for (;;) {
      const u = emptyUnit(p, s, order);
      if (u >= 0) return { unit: u, steps };
      if (!deep) return null;
      const info = analyze(p, s);
      const v = order.find((w) => info[w].cat < 0 && info[w].cands.length === 1);
      if (v === undefined) return null;
      steps.push({ unit: v, cell: info[v].cands[0] });
      placeCat(p, s, info[v].cands[0]);
    }
  }

  // 依序重播推演步驟，確認每一步都還是「只剩一格」；成功回傳最後無處可放的單位，否則 -1
  function replay(p, state, i, steps, order) {
    const s = Array.from(state);
    placeCat(p, s, i);
    for (const st of steps) {
      const { cat, cands } = analyze(p, s)[st.unit];
      if (cat >= 0 || cands.length !== 1 || cands[0] !== st.cell) return -1;
      placeCat(p, s, st.cell);
    }
    return emptyUnit(p, s, order);
  }

  // 拿掉跟矛盾無關的步驟，讓說明只留下必要的推演
  function trimSteps(p, state, i, res, order) {
    let { unit, steps } = res;
    for (let k = steps.length - 1; k >= 0; k--) {
      const rest = steps.slice(0, k).concat(steps.slice(k + 1));
      const u = replay(p, state, i, rest, order);
      if (u >= 0) { steps = rest; unit = u; }
    }
    return { unit, steps };
  }

  function hypothesis(p, state, deep) {
    const order = unitOrder(p);
    let best = null, bestCell = -1;
    for (let i = 0; i < p.n; i++) {
      if (state[i] !== EMPTY) continue;
      let res = propagate(p, state, i, deep, order);
      if (!res) continue;
      if (!deep) { best = res; bestCell = i; break; }
      res = trimSteps(p, state, i, res, order);
      // 挑推演最短的那一格，玩家比較容易看懂
      if (!best || res.steps.length < best.steps.length) { best = res; bestCell = i; }
      if (best.steps.length <= 1) break;
    }
    if (!best) return null;

    const i = bestCell, u = best.unit;
    if (!deep) {
      const info = analyze(p, state);
      const { tokens } = describeAttack(p, i, info[u].cands);
      return hint('eliminate', 'tryOne', [i], p.units[u].cells, [
        '先試著在 ', { cell: i }, ' 放貓：',
        '\n', { unit: u }, ' 剩下的格子全被它排除（', ...tokens, '）',
        '\n→ ', { unit: u }, ' 沒地方放貓，所以 ', { cell: i }, ' 不能放貓 → 打叉',
      ]);
    }

    // 推演鏈：每一步一行，最後一步是無處可放的單位
    const lines = best.steps.map((st) => [{ unit: st.unit }, ' 只剩 ', { cell: st.cell }, ' 能放 → 放貓']);
    lines.push([{ unit: u }, ' 所有格子都被排除了，沒地方放貓 ✗']);
    lines.forEach((line, k) => line.unshift(stepNo(k + 1)));
    const joinLines = (ls) => ls.flatMap((l, k) => (k ? ['\n', ...l] : l));

    const reason = ['先試著在 ', { cell: i }, ' 放貓，看看會發生什麼事：', '\n'];
    if (lines.length > FOLD_AFTER) {
      const middle = lines.slice(1, -1);
      reason.push(...lines[0],
        { fold: joinLines(middle), summary: `展開中間 ${middle.length} 步（共 ${lines.length} 步）` },
        ...lines[lines.length - 1]);
    } else {
      reason.push(...joinLines(lines));
    }
    reason.push('\n→ 產生矛盾，所以 ', { cell: i }, ' 不能放貓 → 打叉');
    const focus = p.units[u].cells.concat(best.steps.map((st) => st.cell));
    return hint('eliminate', 'tryChain', [i], focus, reason);
  }

  // ---- 主要入口 ----

  function nextHint(p, state) {
    // 貓咪彼此衝突
    for (let i = 0; i < p.n; i++) {
      if (state[i] !== CAT) continue;
      for (const j of p.attacks[i]) {
        if (j > i && state[j] === CAT) {
          return hint('mistake', 'mistake', [i, j], [],
            [{ cell: i }, ' 和 ', { cell: j }, ' 兩隻貓互相衝突（同列、同行、同色塊或相鄰）']);
        }
      }
    }

    if (!solve(p, state, 1).length) {
      const base = solve(p, null, 1);
      if (!base.length) return hint('nosolution', 'nosolution', [], [], ['這個盤面無解，請檢查色塊是否正確']);
      const sol = new Set(base[0]);
      const wrong = [];
      for (let i = 0; i < p.n; i++) {
        if ((state[i] === CAT && !sol.has(i)) || (state[i] === CROSS && sol.has(i))) wrong.push(i);
      }
      return hint('mistake', 'mistake', wrong, [], ['這些標記和正解不符，套用後會清除它們']);
    }

    let cats = 0;
    for (let i = 0; i < p.n; i++) if (state[i] === CAT) cats++;
    if (cats === p.N) return hint('solved', 'solved', [], [], ['已經全部解開了！']);

    const info = analyze(p, state);
    const found =
      catConsequences(p, state) ||
      singles(p, state, info) ||
      confinement(p, state, info, 1) ||
      sharedAttack(p, state, info) ||
      confinement(p, state, info, 2) ||
      confinement(p, state, info, 3) ||
      hypothesis(p, state, false) ||
      confinement(p, state, info, 4) || // 比連鎖推演直觀，所以先找
      hypothesis(p, state, true);
    if (found) return found;

    // 都找不到：從正解直接揭示一格（挑候選最少的色塊）
    const sol = solve(p, state, 1)[0];
    let best = -1, bestCount = Infinity;
    for (const i of sol) {
      if (state[i] !== EMPTY) continue;
      const cnt = info[unitOf(p, 'region', i)].cands.length;
      if (cnt < bestCount) { best = i; bestCount = cnt; }
    }
    return hint('place', 'reveal', [best], [],
      ['這一步需要更進階的推理，直接揭曉：', { cell: best }, ' 是貓咪']);
  }

  // 套用提示，回傳新的 state；autoCross 為 true 時放貓會自動排除周圍
  function applyHint(p, state, h, autoCross) {
    const s = Array.from(state);
    if (h.kind === 'place') {
      for (const i of h.cells) {
        s[i] = CAT;
        if (autoCross) for (const j of p.attacks[i]) if (s[j] === EMPTY) s[j] = CROSS;
      }
    } else if (h.kind === 'eliminate') {
      for (const i of h.cells) s[i] = CROSS;
    } else if (h.kind === 'mistake') {
      for (const i of h.cells) s[i] = EMPTY;
    }
    return s;
  }

  function popcount(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }

  function joinTokens(units) {
    const out = [];
    units.forEach((u, idx) => { if (idx) out.push('、'); out.push({ unit: u }); });
    return out;
  }

  const api = { EMPTY, CROSS, CAT, validate, create, solve, nextHint, applyHint, TYPE_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.QueensEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
