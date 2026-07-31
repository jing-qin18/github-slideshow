(() => {
  const TOTAL_NUMBERS = 80;
  const DRAW_COUNT = 20;
  const HISTORY_SIZE = 100;

  const strategyLabels = {
    balanced: "均衡混合",
    hot: "熱號優先",
    cold: "冷號回歸",
    gap: "遺漏補號",
    oddEven: "單雙平衡",
    bigSmall: "大小平衡",
    random: "純隨機",
  };

  /** Deterministic PRNG for reproducible mock history */
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

  function predict(strategy, count, stats) {
    const all = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
    const freqMap = Object.fromEntries(stats.gaps.map((g) => [g.n, g.freq]));
    const gapMap = Object.fromEntries(stats.gaps.map((g) => [g.n, g.gap]));

    if (strategy === "random") {
      return shuffle(all).slice(0, count).sort((a, b) => a - b);
    }

    if (strategy === "hot") {
      return weightedPick(all, all.map((n) => freqMap[n] ** 1.6 + 0.5), count);
    }

    if (strategy === "cold") {
      const maxF = Math.max(...all.map((n) => freqMap[n]));
      return weightedPick(all, all.map((n) => (maxF - freqMap[n] + 1) ** 1.4), count);
    }

    if (strategy === "gap") {
      return weightedPick(all, all.map((n) => gapMap[n] ** 1.3 + 0.5), count);
    }

    if (strategy === "oddEven") {
      const odds = all.filter((n) => n % 2 === 1);
      const evens = all.filter((n) => n % 2 === 0);
      const oddCount = Math.floor(count / 2);
      const evenCount = count - oddCount;
      const weight = (n) => freqMap[n] * 0.6 + gapMap[n] * 0.4 + 1;
      return [
        ...weightedPick(odds, odds.map(weight), oddCount),
        ...weightedPick(evens, evens.map(weight), evenCount),
      ].sort((a, b) => a - b);
    }

    if (strategy === "bigSmall") {
      const smalls = all.filter((n) => n <= 40);
      const bigs = all.filter((n) => n >= 41);
      const smallCount = Math.floor(count / 2);
      const bigCount = count - smallCount;
      const weight = (n) => freqMap[n] * 0.55 + gapMap[n] * 0.45 + 1;
      return [
        ...weightedPick(smalls, smalls.map(weight), smallCount),
        ...weightedPick(bigs, bigs.map(weight), bigCount),
      ].sort((a, b) => a - b);
    }

    // balanced
    const hotPool = stats.byFreq.slice(0, 25).map((x) => x.n);
    const coldPool = stats.byFreq.slice(-25).map((x) => x.n);
    const gapPool = stats.byGap.slice(0, 25).map((x) => x.n);
    const mid = Math.max(1, Math.floor(count / 3));
    const rest = count - mid * 2;
    const picked = new Set([
      ...weightedPick(hotPool, hotPool.map((n) => freqMap[n] + 1), mid),
      ...weightedPick(coldPool, coldPool.map((n) => 30 - freqMap[n]), mid),
      ...weightedPick(gapPool, gapPool.map((n) => gapMap[n] + 1), rest),
    ]);
    while (picked.size < count) {
      picked.add(1 + Math.floor(Math.random() * TOTAL_NUMBERS));
    }
    return [...picked].slice(0, count).sort((a, b) => a - b);
  }

  function formatTime(date) {
    return date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderBalls(numbers, className = "ball") {
    return numbers
      .map((n, i) => {
        const classes = [className];
        if (n >= 41) classes.push("big");
        if (n % 2 === 1) classes.push("odd");
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

    const summary = document.getElementById("statSummary");
    summary.innerHTML = `
      <div class="summary-chip"><span>模擬期數</span><strong>${history.length}</strong></div>
      <div class="summary-chip"><span>平均出現</span><strong>${(DRAW_COUNT * history.length / TOTAL_NUMBERS).toFixed(1)}</strong></div>
      <div class="summary-chip"><span>最熱號碼</span><strong>${String(stats.byFreq[0].n).padStart(2, "0")}</strong></div>
    `;

    const board = document.getElementById("numberBoard");
    board.innerHTML = stats.gaps
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

  function runPrediction(stats) {
    const strategy = document.getElementById("strategy").value;
    const pickCount = Number(document.getElementById("pickCount").value);
    const setCount = Number(document.getElementById("setCount").value);
    const setsEl = document.getElementById("predictionSets");
    const meta = document.getElementById("predictionMeta");

    const sets = Array.from({ length: setCount }, (_, i) => ({
      label: `預測組合 ${i + 1}`,
      numbers: predict(strategy, pickCount, stats),
    }));

    meta.hidden = false;
    document.getElementById("metaStrategy").textContent = `策略：${strategyLabels[strategy]}`;
    document.getElementById("metaTime").textContent = `產生時間：${new Date().toLocaleString("zh-TW")}`;

    setsEl.innerHTML = sets
      .map(
        (set, idx) => `
        <article class="set-card" style="animation-delay:${idx * 0.08}s">
          <h3>${set.label}</h3>
          <div class="balls">${renderBalls(set.numbers)}</div>
        </article>`
      )
      .join("");
  }

  function init() {
    const history = buildHistory();
    const stats = analyze(history);
    renderStats(history, stats);
    renderTrend(stats);

    document.getElementById("predictBtn").addEventListener("click", () => runPrediction(stats));
    runPrediction(stats);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
