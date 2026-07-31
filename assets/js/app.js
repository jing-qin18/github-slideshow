(() => {
  const TOTAL_NUMBERS = 80;
  const DRAW_COUNT = 20;
  const HISTORY_SIZE = 100;
  const STAKE = 25;

  /** 台彩賓果星號玩法基本倍率（一般期，非加碼；單注 25 元） */
  const STAR_TABLE = {
    1: { 1: 2 },
    2: { 2: 3 },
    3: { 2: 2, 3: 20 },
    4: { 2: 1, 3: 2, 4: 40 },
    5: { 3: 2, 4: 20, 5: 300 },
    6: { 3: 1, 4: 2, 5: 20, 6: 1000 },
  };

  const strategyLabels = {
    balanced: "均衡混合",
    hot: "熱號優先",
    cold: "冷號回歸",
    gap: "遺漏補號",
    oddEven: "單雙平衡",
    bigSmall: "大小平衡",
    random: "純隨機",
  };

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function drawNumbers(rand) {
    const pool = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
    return shuffle(pool, rand).slice(0, DRAW_COUNT).sort((a, b) => a - b);
  }

  function buildHistory(seed = 20260731) {
    const rand = mulberry32(seed);
    const history = [];
    const now = Date.now();
    for (let i = HISTORY_SIZE; i >= 1; i -= 1) {
      history.push({
        period: String(114070000 + (HISTORY_SIZE - i + 1)).padStart(9, "0"),
        time: new Date(now - i * 5 * 60 * 1000),
        numbers: drawNumbers(rand),
      });
    }
    return history;
  }

  function analyze(history) {
    const freq = Array(TOTAL_NUMBERS + 1).fill(0);
    const lastSeen = Array(TOTAL_NUMBERS + 1).fill(-1);

    history.forEach((draw, idx) => {
      draw.numbers.forEach((n) => {
        freq[n] += 1;
        lastSeen[n] = idx;
      });
    });

    const latestIdx = history.length - 1;
    const gaps = Array.from({ length: TOTAL_NUMBERS }, (_, i) => {
      const n = i + 1;
      const gap = lastSeen[n] < 0 ? history.length : latestIdx - lastSeen[n];
      return { n, gap, freq: freq[n] };
    });

    const byFreq = gaps.slice().sort((a, b) => b.freq - a.freq || a.n - b.n);
    const byGap = gaps.slice().sort((a, b) => b.gap - a.gap || a.n - b.n);

    const recent = history.slice(-30);
    let big = 0;
    let small = 0;
    let odd = 0;
    let even = 0;
    recent.forEach((draw) => {
      draw.numbers.forEach((n) => {
        if (n >= 41) big += 1;
        else small += 1;
        if (n % 2 === 1) odd += 1;
        else even += 1;
      });
    });

    return { freq, gaps, byFreq, byGap, big, small, odd, even, recent };
  }

  function weightedPick(candidates, weights, count, rand = Math.random) {
    const chosen = new Set();
    const pool = candidates.map((n, i) => ({ n, w: Math.max(weights[i], 0.01) }));

    while (chosen.size < count && pool.length) {
      const total = pool.reduce((s, p) => s + p.w, 0);
      let r = rand() * total;
      let idx = 0;
      for (; idx < pool.length; idx += 1) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      chosen.add(pool[idx].n);
      pool.splice(idx, 1);
    }
    return [...chosen].sort((a, b) => a - b);
  }

  /** 產生候選號池，再從中抽出剛好 star 顆的一注 */
  function buildCandidatePool(strategy, stats, poolSize = 24) {
    const all = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
    const freqMap = Object.fromEntries(stats.gaps.map((g) => [g.n, g.freq]));
    const gapMap = Object.fromEntries(stats.gaps.map((g) => [g.n, g.gap]));
    const size = Math.min(Math.max(poolSize, 8), TOTAL_NUMBERS);

    if (strategy === "random") return shuffle(all).slice(0, size).sort((a, b) => a - b);
    if (strategy === "hot") return weightedPick(all, all.map((n) => freqMap[n] ** 1.6 + 0.5), size);
    if (strategy === "cold") {
      const maxF = Math.max(...all.map((n) => freqMap[n]));
      return weightedPick(all, all.map((n) => (maxF - freqMap[n] + 1) ** 1.4), size);
    }
    if (strategy === "gap") return weightedPick(all, all.map((n) => gapMap[n] ** 1.3 + 0.5), size);

    if (strategy === "oddEven") {
      const odds = all.filter((n) => n % 2 === 1);
      const evens = all.filter((n) => n % 2 === 0);
      const oddCount = Math.floor(size / 2);
      const weight = (n) => freqMap[n] * 0.6 + gapMap[n] * 0.4 + 1;
      return [
        ...weightedPick(odds, odds.map(weight), oddCount),
        ...weightedPick(evens, evens.map(weight), size - oddCount),
      ].sort((a, b) => a - b);
    }

    if (strategy === "bigSmall") {
      const smalls = all.filter((n) => n <= 40);
      const bigs = all.filter((n) => n >= 41);
      const smallCount = Math.floor(size / 2);
      const weight = (n) => freqMap[n] * 0.55 + gapMap[n] * 0.45 + 1;
      return [
        ...weightedPick(smalls, smalls.map(weight), smallCount),
        ...weightedPick(bigs, bigs.map(weight), size - smallCount),
      ].sort((a, b) => a - b);
    }

    // balanced
    const hotPool = stats.byFreq.slice(0, 30).map((x) => x.n);
    const coldPool = stats.byFreq.slice(-30).map((x) => x.n);
    const gapPool = stats.byGap.slice(0, 30).map((x) => x.n);
    const a = Math.floor(size / 3);
    const b = Math.floor(size / 3);
    const c = size - a - b;
    const picked = new Set([
      ...weightedPick(hotPool, hotPool.map((n) => freqMap[n] + 1), a),
      ...weightedPick(coldPool, coldPool.map((n) => 30 - freqMap[n]), b),
      ...weightedPick(gapPool, gapPool.map((n) => gapMap[n] + 1), c),
    ]);
    while (picked.size < size) picked.add(1 + Math.floor(Math.random() * TOTAL_NUMBERS));
    return [...picked].slice(0, size).sort((a, b) => a - b);
  }

  function scoreNumber(n, stats) {
    const g = stats.gaps.find((x) => x.n === n);
    return (g?.freq || 0) * 2 + (g?.gap || 0);
  }

  /** 從候選池抽出一注剛好 star 顆；可避開已用組合 */
  function pickTicket(pool, star, stats, usedKeys = new Set(), rand = Math.random) {
    const ranked = pool.slice().sort((a, b) => scoreNumber(b, stats) - scoreNumber(a, stats) || a - b);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const weights = ranked.map((n, i) => 1 / (1 + i * 0.15) + (attempt > 10 ? rand() : 0));
      const pick = weightedPick(ranked, weights, star, rand);
      const key = pick.join("-");
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        return pick;
      }
    }
    const fallback = shuffle(pool, rand).slice(0, star).sort((a, b) => a - b);
    usedKeys.add(fallback.join("-"));
    return fallback;
  }

  function generateTickets(strategy, star, setCount, stats) {
    const pool = buildCandidatePool(strategy, stats, Math.max(star * 4, 18));
    const used = new Set();
    const tickets = Array.from({ length: setCount }, (_, i) => ({
      label: `第 ${i + 1} 組`,
      numbers: pickTicket(pool, star, stats, used),
    }));
    return { pool, tickets };
  }

  function prizeForStar(star, hits) {
    const table = STAR_TABLE[star];
    if (!table) return 0;
    return (table[hits] || 0) * STAKE;
  }

  function compareTicket(ticketNumbers, drawNumbers) {
    const drawSet = new Set(drawNumbers);
    const matched = ticketNumbers.filter((n) => drawSet.has(n));
    return { matched, hitCount: matched.length, amount: prizeForStar(ticketNumbers.length, matched.length) };
  }

  function rollingStarStats(history, strategy, lookback = 20) {
    const stars = [2, 3, 4, 5, 6];
    const totals = Object.fromEntries(
      stars.map((s) => [s, { profit: 0, wins: 0, fullHits: 0, trials: 0 }])
    );

    const start = Math.max(15, history.length - lookback);
    for (let i = start; i < history.length; i += 1) {
      const pastStats = analyze(history.slice(0, i));
      stars.forEach((star) => {
        const { tickets } = generateTickets(strategy, star, 1, pastStats);
        const result = compareTicket(tickets[0].numbers, history[i].numbers);
        const amount = result.amount;
        totals[star].profit += amount - STAKE;
        totals[star].trials += 1;
        if (amount > 0) totals[star].wins += 1;
        if (result.hitCount === star) totals[star].fullHits += 1;
      });
    }

    const ranked = stars
      .map((star) => {
        const t = totals[star];
        return {
          star,
          ...t,
          avgProfit: t.trials ? t.profit / t.trials : 0,
          winRate: t.trials ? t.wins / t.trials : 0,
        };
      })
      .sort((a, b) => b.avgProfit - a.avgProfit || b.winRate - a.winRate || a.star - b.star);

    let recommended = ranked[0];
    const near = ranked.filter((r) => Math.abs(r.avgProfit - ranked[0].avgProfit) < 8);
    if (near.some((r) => r.star === 3)) recommended = near.find((r) => r.star === 3);

    return { ranked, recommended: recommended.star, trials: ranked[0]?.trials || 0 };
  }

  function formatTime(date) {
    return date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMoney(n) {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toLocaleString("zh-TW")} 元`;
  }

  function renderBalls(numbers, className = "ball", matchedSet = null) {
    return numbers
      .map((n, i) => {
        const classes = [className];
        if (n >= 41) classes.push("big");
        if (n % 2 === 1) classes.push("odd");
        if (matchedSet) {
          if (matchedSet.has(n)) classes.push("hit");
          else classes.push("miss");
        }
        return `<span class="${classes.join(" ")}" style="animation-delay:${i * 0.03}s">${String(n).padStart(2, "0")}</span>`;
      })
      .join("");
  }

  function heatClass(freq, min, max) {
    const t = max === min ? 0.5 : (freq - min) / (max - min);
    if (t >= 0.66) return "hot";
    if (t >= 0.33) return "warm";
    return "cold";
  }

  function renderStats(history, stats) {
    const freqs = stats.gaps.map((g) => g.freq);
    const min = Math.min(...freqs);
    const max = Math.max(...freqs);

    document.getElementById("statSummary").innerHTML = `
      <div class="summary-chip"><span>模擬期數</span><strong>${history.length}</strong></div>
      <div class="summary-chip"><span>平均出現</span><strong>${(DRAW_COUNT * history.length / TOTAL_NUMBERS).toFixed(1)}</strong></div>
      <div class="summary-chip"><span>最熱號碼</span><strong>${String(stats.byFreq[0].n).padStart(2, "0")}</strong></div>
    `;

    document.getElementById("numberBoard").innerHTML = stats.gaps
      .map((g) => {
        const cls = heatClass(g.freq, min, max);
        return `<div class="num-cell ${cls}" role="listitem" aria-label="號碼 ${g.n}">
          ${String(g.n).padStart(2, "0")}
          <span class="tip">出現 ${g.freq} 次 · 遺漏 ${g.gap} 期</span>
        </div>`;
      })
      .join("");

    const fillList = (id, items, formatter) => {
      document.getElementById(id).innerHTML = items
        .slice(0, 10)
        .map((item) => `<li>${formatter(item)}</li>`)
        .join("");
    };

    fillList("hotList", stats.byFreq, (x) => `<em>${String(x.n).padStart(2, "0")}</em> · ${x.freq} 次`);
    fillList("coldList", stats.byFreq.slice().reverse(), (x) => `<em>${String(x.n).padStart(2, "0")}</em> · ${x.freq} 次`);
    fillList("gapList", stats.byGap, (x) => `<em>${String(x.n).padStart(2, "0")}</em> · 遺漏 ${x.gap} 期`);
  }

  function renderTrend(stats) {
    const totalBS = stats.big + stats.small;
    const totalOE = stats.odd + stats.even;
    const pct = (v, t) => (t ? Math.round((v / t) * 100) : 0);
    const bigPct = pct(stats.big, totalBS);
    const smallPct = pct(stats.small, totalBS);
    const oddPct = pct(stats.odd, totalOE);
    const evenPct = pct(stats.even, totalOE);

    document.getElementById("bigSmallBars").innerHTML = `
      <div class="bar-row"><span>大</span><div class="bar-track"><div class="bar-fill" data-width="${bigPct}"></div></div><span>${bigPct}%</span></div>
      <div class="bar-row"><span>小</span><div class="bar-track"><div class="bar-fill alt" data-width="${smallPct}"></div></div><span>${smallPct}%</span></div>
    `;
    document.getElementById("oddEvenBars").innerHTML = `
      <div class="bar-row"><span>單</span><div class="bar-track"><div class="bar-fill" data-width="${oddPct}"></div></div><span>${oddPct}%</span></div>
      <div class="bar-row"><span>雙</span><div class="bar-track"><div class="bar-fill alt" data-width="${evenPct}"></div></div><span>${evenPct}%</span></div>
    `;

    document.getElementById("bigSmallHint").textContent =
      bigPct === smallPct
        ? "近 30 期大小相當，可考慮大小平衡選號。"
        : bigPct > smallPct
          ? "近 30 期偏「大」，可適度提高 41–80。"
          : "近 30 期偏「小」，可適度提高 01–40。";

    document.getElementById("oddEvenHint").textContent =
      oddPct === evenPct
        ? "近 30 期單雙相當，可考慮單雙平衡選號。"
        : oddPct > evenPct
          ? "近 30 期偏「單」，可適度提高單數號碼。"
          : "近 30 期偏「雙」，可適度提高雙數號碼。";

    requestAnimationFrame(() => {
      document.querySelectorAll(".bar-fill").forEach((el) => {
        el.style.width = `${el.dataset.width}%`;
      });
    });

    document.getElementById("historyList").innerHTML = stats.recent
      .slice()
      .reverse()
      .slice(0, 8)
      .map(
        (draw) => `
        <div class="history-item">
          <div class="period">第 ${draw.period.slice(-4)} 期<br><small style="color:var(--muted);font-weight:500">${formatTime(draw.time)}</small></div>
          <div class="mini-balls">${draw.numbers.map((n) => `<span class="mini-ball">${String(n).padStart(2, "0")}</span>`).join("")}</div>
        </div>`
      )
      .join("");
  }

  function getForm() {
    const autoStar = document.getElementById("autoStar").checked;
    return {
      strategy: document.getElementById("strategy").value || "balanced",
      star: Number(document.getElementById("starCount").value) || 3,
      autoStar,
      setCount: Math.max(1, Number(document.getElementById("setCount").value) || 5),
      periods: Math.max(1, Number(document.getElementById("periodCount").value) || 1),
      multiplier: Math.max(1, Number(document.getElementById("multiplier").value) || 1),
    };
  }

  function renderTickets(history, stats) {
    const form = getForm();
    const rolling = rollingStarStats(history, form.strategy, 20);
    const star = form.autoStar ? rolling.recommended : form.star;
    if (form.autoStar) {
      document.getElementById("starCount").value = String(star);
    }

    const { pool, tickets } = generateTickets(form.strategy, star, form.setCount, stats);
    const prev = history[history.length - 1];
    const ticketResults = tickets.map((t) => {
      const cmp = compareTicket(t.numbers, prev.numbers);
      return { ...t, ...cmp };
    });

    const singleCost = STAKE * form.multiplier;
    const totalCost = singleCost * form.setCount * form.periods;
    const prevPrizePerPeriod = ticketResults.reduce((s, t) => s + t.amount, 0) * form.multiplier;
    const prevProfitOnePeriod = prevPrizePerPeriod - singleCost * form.setCount;

    document.getElementById("predictionMeta").hidden = false;
    document.getElementById("metaStrategy").textContent =
      `玩法：${star} 星 · 策略：${strategyLabels[form.strategy]}${form.autoStar ? "（自動推薦星等）" : ""}`;
    document.getElementById("metaTime").textContent = `產生時間：${new Date().toLocaleString("zh-TW")}`;

    document.getElementById("costSummary").innerHTML = `
      <div class="summary-chip"><span>投注內容</span><strong>${star} 星 × ${form.setCount} 組</strong><small>連買 ${form.periods} 期 · ${form.multiplier} 倍</small></div>
      <div class="summary-chip"><span>單注金額</span><strong>${singleCost.toLocaleString("zh-TW")} 元</strong><small>25 × ${form.multiplier} 倍</small></div>
      <div class="summary-chip"><span>總投注金額</span><strong class="cost-total">${totalCost.toLocaleString("zh-TW")} 元</strong><small>${form.setCount} 組 × ${form.periods} 期 × ${form.multiplier} 倍</small></div>
    `;

    document.getElementById("candidatePool").innerHTML = `
      <h4>候選號池（參考，不用全買）</h4>
      <div class="balls">${renderBalls(pool, "ball mini")}</div>
    `;

    document.getElementById("predictionSets").innerHTML = ticketResults
      .map((t, idx) => {
        const matchedSet = new Set(t.matched);
        const prizeText = t.amount > 0
          ? `前一期回測：中 ${t.hitCount} → ${t.amount * form.multiplier} 元`
          : `前一期回測：中 ${t.hitCount} → 未中獎`;
        return `
        <article class="set-card ticket-card" style="animation-delay:${idx * 0.05}s">
          <h3>
            <span>${t.label} · ${star} 星</span>
            <span class="set-hit">${prizeText}</span>
          </h3>
          <div class="balls">${renderBalls(t.numbers, "ball", matchedSet)}</div>
          <p class="ticket-line">可直接跟彩券行說：買 ${star} 星，號碼 ${t.numbers.map((n) => String(n).padStart(2, "0")).join(" ")}，${form.multiplier} 倍，連 ${form.periods} 期</p>
        </article>`;
      })
      .join("");

    const rollingRec = rolling.ranked.find((r) => r.star === rolling.recommended);
    document.getElementById("backtestPanel").hidden = false;
    document.getElementById("prevPeriodLabel").textContent =
      `第 ${prev.period.slice(-4)} 期 · ${formatTime(prev.time)}`;
    document.getElementById("prevDrawBalls").innerHTML = renderBalls(prev.numbers, "ball mini");

    const winSets = ticketResults.filter((t) => t.amount > 0).length;
    document.getElementById("hitSummary").innerHTML = `
      <div class="summary-chip">
        <span>前一期有獎組數</span>
        <strong class="hit-num">${winSets}</strong>
        <small>/ ${form.setCount} 組</small>
      </div>
      <div class="summary-chip">
        <span>前一期回測獎金</span>
        <strong>${prevPrizePerPeriod.toLocaleString("zh-TW")} 元</strong>
        <small>以本次 ${form.setCount} 組、${form.multiplier} 倍估算一期</small>
      </div>
      <div class="summary-chip ${prevProfitOnePeriod >= 0 ? "recommend" : ""}">
        <span>前一期回測損益</span>
        <strong>${formatMoney(prevProfitOnePeriod)}</strong>
        <small>尚未乘上連買期數</small>
      </div>
    `;

    document.getElementById("matchedBalls").innerHTML = ticketResults
      .map((t) => {
        if (!t.matched.length) {
          return `<div class="match-row"><span class="match-label">${t.label}</span><span class="empty-hint">沒對中</span></div>`;
        }
        return `<div class="match-row"><span class="match-label">${t.label} 中 ${t.hitCount}</span><div class="balls">${renderBalls(t.matched, "ball")}</div></div>`;
      })
      .join("");

    const starRows = [2, 3, 4, 5, 6].map((s) => {
      const row = rolling.ranked.find((r) => r.star === s);
      return {
        star: s,
        avgProfit: row?.avgProfit || 0,
        winRate: row?.winRate || 0,
        fullRate: row ? row.fullHits / Math.max(row.trials, 1) : 0,
      };
    });

    document.getElementById("starTable").innerHTML = `
      <div class="star-table-head">
        <span>星等</span><span>有獎率</span><span>全中率</span><span>平均損益／注</span>
      </div>
      ${starRows
        .map((row) => {
          const cls = row.avgProfit > 0 ? "profit" : row.avgProfit === 0 ? "even" : "loss";
          const mark = row.star === rolling.recommended ? " best" : "";
          const current = row.star === star ? " current" : "";
          return `<div class="star-table-row ${cls}${mark}${current}">
            <span>${row.star} 星${row.star === star ? " ←本次" : ""}</span>
            <span>${(row.winRate * 100).toFixed(0)}%</span>
            <span>${(row.fullRate * 100).toFixed(0)}%</span>
            <span>${formatMoney(Math.round(row.avgProfit))}</span>
          </div>`;
        })
        .join("")}
    `;

    document.getElementById("recommendBox").innerHTML = `
      <div class="recommend-badge">${rolling.recommended} 星</div>
      <div class="recommend-copy">
        <h3>資料建議：玩 ${rolling.recommended} 星</h3>
        <p>依「${strategyLabels[form.strategy]}」近 ${rolling.trials} 期回測，
          ${rolling.recommended} 星平均每注損益 <strong>${formatMoney(Math.round(rollingRec.avgProfit))}</strong>，
          有獎率 ${(rollingRec.winRate * 100).toFixed(0)}%。</p>
        <p>你目前設定是 <strong>${star} 星 × ${form.setCount} 組 × ${form.periods} 期 × ${form.multiplier} 倍</strong>，
          總金額 <strong>${totalCost.toLocaleString("zh-TW")} 元</strong>。
          ${form.periods > 1 ? `同一組號碼會連買 ${form.periods} 期（約 ${form.periods * 5} 分鐘）。` : "只買一期。"}</p>
        <p class="recommend-note">每組剛好 ${star} 個號碼，可直接照「第 N 組」跟彩券行下單；綠框是前一期有對中的號碼。</p>
      </div>
    `;
  }

  function init() {
    const history = buildHistory();
    const stats = analyze(history);
    renderStats(history, stats);
    renderTrend(stats);

    const rerun = () => renderTickets(history, stats);
    document.getElementById("predictBtn").addEventListener("click", rerun);
    document.getElementById("autoStar").addEventListener("change", (e) => {
      document.getElementById("starCount").disabled = e.target.checked;
      rerun();
    });
    ["strategy", "starCount", "setCount", "periodCount", "multiplier"].forEach((id) => {
      document.getElementById(id).addEventListener("change", rerun);
    });

    rerun();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
