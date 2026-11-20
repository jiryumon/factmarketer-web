/* 팩트마케터 for 티링크 — 실제 사용 화면. 프레임워크 없이 동작합니다.
   분석 자료는 d/*.json, 검수 · 만들기 · 고치기는 /api/* 를 부릅니다. 키는 서버에만 있고 이 화면에는 없습니다. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ROLES = ["경영진", "영업 관리자", "전산·총무 담당"];
  const ROLE_LABEL = { "경영진": "경영진", "영업 관리자": "실무 관리자", "전산·총무 담당": "전산 담당자" };
  const MARKET_LABEL = { "공통": "시장 공통", "의료기관": "의료", "교육기관": "교육기관", "콜센터": "콜센터", "무역·물류": "무역·물류" };
  const MARKET_SLUG = { "공통": "common", "의료기관": "medical", "교육기관": "education", "콜센터": "callcenter", "무역·물류": "trade" };
  const PHOTO_MARKET = { "교육": "교육기관", "의료": "의료기관" };
  const KINDS = ["카드뉴스", "블로그", "도입 사례", "영업 이메일"];
  const DOCS = [["블로그", "블로그"], ["도입 사례", "도입사례"], ["영업 이메일", "이메일"]];
  const DOCKEY = Object.fromEntries(DOCS);
  const SIX = [["Who", "누가 결정하나"], ["Problem", "겪는 문제"], ["WhyNow", "왜 지금"], ["Value", "제품이 주는 가치"], ["Objection", "망설이는 이유"], ["Proof", "믿을 근거"]];
  const FOOTER = ["www.tlinkcrm.com", "blog.naver.com/mobilecrm", "1877-3836", "tlinkcrm.com/center.php"];
  const TONES = [["확인된 사실", "ok"], ["통과", "ok"], ["일치", "ok"], ["1순위", "ok"], ["2순위", "ok"], ["3순위", "ok"], ["AI 추론", "info"], ["검증 필요", "warn"], ["확인 필요", "warn"],
    ["검토 필요", "warn"], ["범위·조건 불명확", "warn"], ["추가 확인 필요", "warn"], ["신규 시장 제안", "warn"], ["차단", "bad"], ["확정적 충돌", "bad"], ["불일치", "bad"]];
  const INJECT = [["없는 수치 넣기", "도입 기업의 통화 누락률이 87% 줄었습니다."], ["조건 없는 99% 넣기", "녹취 성공률은 99%입니다."],
    ["실제 고객명 넣기", "새봄물산 도입 사례도 있습니다."], ["안 되는 기능 넣기", "아이폰 통화도 자동으로 녹음됩니다."]];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 계속 */ } },
  };
  const S = {
    base: null, cards: [], byId: {}, health: { ai: false, code_required: false },
    sel: { photo: null, market: null, roles: [...ROLES], kinds: ["카드뉴스", "블로그"] },
    results: {}, edits: {}, logs: {}, approvals: store.get("fm_approvals", {}),
    confirmed: store.get("fm_confirmed", {}), rules: store.get("fm_rules", []),
    view: {}, showIds: false, rv: { key: null, role: null, kind: null, data: null, seen: false }, tests: null, busy: false,
  };

  // ───────────── 작은 도구 ─────────────
  const chip = (label) => { const t = (TONES.find(([k]) => String(label).startsWith(k)) || [0, "mute"])[1]; return `<span class="chip ${t}">${esc(label)}</span>`; };
  const stem = (f) => String(f).replace(/\.[a-z]+$/i, "");
  const keyOf = (photo, market) => `${stem(photo)}-${MARKET_SLUG[market] || "m"}`;
  const marketOf = (name) => (S.base.시장 || []).find((x) => x.산업 === name);
  const photoOf = (name) => (S.base.사진 || []).find((p) => p.파일 === name) || {};
  const photoLabel = (name) => { const p = photoOf(name); return [p.가린고객명 || p.설치형태_홈페이지 || stem(name), p.업종 || p.구분].filter(Boolean).join(" · "); };
  const now = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  function toast(msg, ms = 3200) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hide"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hide"), ms); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  async function api(name, payload) {
    const r = await fetch("/api/" + name, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
    let data = {};
    try { data = await r.json(); } catch (e) { data = { error: `서버가 답하지 않았습니다 (${r.status}).` }; }
    if (!r.ok) throw new Error(data.error || `오류 ${r.status}`);
    return data;
  }
  const common = () => ({ rules: S.rules, confirmed: S.confirmed, code: sessionStorage.getItem("fm_code") || "" });
  function sources(ids, limit = 6) {
    return (ids || []).filter((i) => S.byId[i]).slice(0, limit).map((i) => { const c = S.byId[i]; return `<div class="src"><b>${esc(c.출처)}</b> · ${esc(c.내용)}<br>원문 “${esc(c.원문)}”</div>`; }).join("");
  }
  function evid(ids, label = "근거 보기") {
    const ok = (ids || []).filter((i) => S.byId[i]);
    return ok.length ? `<details><summary>${esc(label)} ${ok.length}</summary>${sources(ok, 8)}</details>` : "";
  }
  function firstSentence(text) { const t = String(text || ""), i = t.indexOf(". "); return i > 0 ? t.slice(0, i + 1) : t; }

  // ───────────── 1 · 분석 ─────────────
  function renderAnalysis() {
    const B = S.base, sum = B.요약;
    const ranked = B.시장.filter((x) => /순위$/.test(x.추천 || "")).sort((a, b) => (b.가중점수 || 0) - (a.가중점수 || 0));
    const order = ranked.concat(B.시장.filter((x) => !/순위$/.test(x.추천 || "")));
    const usp = B.차별점.map((it) => {
      const cut = it.내용.indexOf(". ");
      const lead = cut > 0 ? it.내용.slice(0, cut + 1) : it.내용, rest = cut > 0 ? it.내용.slice(cut + 2) : "";
      return `<div class="card">${chip(it.표시)}<p class="lead">${esc(lead)}</p><p>${esc(rest)}</p>${evid(it.근거카드)}</div>`;
    }).join("");
    const markets = order.map((x) => {
      const sc = x.가중점수;
      const hold = /순위$/.test(x.추천 || "") || !x.보류사유 ? "" : " · " + esc(x.보류사유);
      const rows = (x.평가 || []).map((e) => `<tr><td>${esc(e.기준)}</td><td>${e.점수 == null ? "판단 보류" : esc(e.점수)}</td><td>${esc(e.이유)}</td><td>${esc(e.필요자료 || "")}</td></tr>`).join("");
      const ids = [...new Set((x.평가 || []).flatMap((e) => e.근거카드 || []))];
      return `<div class="card"><h3>${esc(MARKET_LABEL[x.산업] || x.산업)} ${chip(x.추천 || "추천 보류")}${x.시장표시 ? chip(x.시장표시) : ""}</h3>
        <div class="big">${sc == null ? "–" : Number(sc).toFixed(1)}<small> / 5</small></div><div class="bar"><div style="width:${(sc || 0) * 20}%"></div></div>
        <div class="row"><span>도입 실적 <b>${(x.도입실적카드 || []).length}</b></span><span>전용 자료 <b>${x.전용자료카드수 || 0}</b></span><span>설치 사진 <b>${x.설치사례사진 || 0}</b></span></div>
        <p style="margin-top:10px">${esc(firstSentence(x.추천이유))}</p><small>평가 기준의 ${x.근거비중 || 0}%에 근거가 있습니다${hold}</small>
        <details><summary>평가 자세히</summary><div class="tbl" style="margin-top:8px"><table><tr><th>기준</th><th>점수</th><th>이유</th><th>더 필요한 자료</th></tr>${rows}</table></div>
        ${(x.부족한정보 || []).length ? `<p style="margin-top:8px"><b>부족한 정보</b></p><ul>${x.부족한정보.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}${sources(ids, 4)}</details></div>`;
    }).join("");
    const people = B.결정자.map((d) => `<div class="card"><h3>${esc(ROLE_LABEL[d.역할] || d.역할)}</h3><p><b>관심</b> ${esc(d.관심사)}</p><p><b>걱정</b> ${esc(d.걱정)}</p>
      <ul>${(d.설득포인트 || []).slice(0, 3).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>${evid(d.근거카드)}</div>`).join("");
    const conflicts = B.불일치.map((x, i) => {
      const uniq = []; (x.값들 || []).forEach((v) => { if (!uniq.some((u) => u.숫자 === v.숫자)) uniq.push(v); });
      const cur = S.confirmed[x.항목];
      const pick = uniq.length > 1 ? `<div class="pick" data-item="${esc(x.항목)}"><span class="note">채택할 값 고르기</span>
        ${uniq.map((v) => `<label class="${cur === v.숫자 ? "on" : ""}"><input type="radio" name="pick${i}" value="${esc(v.숫자)}">${esc(v.값)} <small>(${esc(v.출처)})</small></label>`).join("")}
        <label class="${cur == null ? "on" : ""}"><input type="radio" name="pick${i}" value="">정하지 않음</label></div>` : "";
      return `<div class="item">${chip(x.분류)}<b>${esc(x.항목)}</b> &nbsp;<span class="t">${esc(x.내용)}</span><br><small>처리: ${esc(x.처리)}</small>${pick}${evid(x.카드, "원문 비교")}</div>`;
    }).join("");
    const enc = (B.암호화 || []).length ? `<div class="item">${chip("확인된 사실")}<b>암호화 방식</b> &nbsp;<span class="t">AES256은 녹취 파일, SHA256은 비밀번호용입니다. 용도가 달라 충돌이 아닙니다.</span>${evid(B.암호화, "원문 비교")}</div>` : "";
    const kinds = [...new Set(S.cards.map((c) => c.유형))].sort();
    $("#tab-analysis").innerHTML = `
      <div class="grid g4">
        <div class="card kpi"><b>${sum.자료}개</b><span>읽은 자료 · ${sum.쪽 || "-"}쪽</span></div>
        <div class="card kpi"><b>${sum.사실}개</b><span>확인한 사실</span> <em>원문 일치 ${sum.원문일치}개</em></div>
        <div class="card kpi"><b>${sum.차별점}개</b><span>기술적 차별점</span></div>
        <div class="card kpi"><b>${sum.불일치}건</b><span>자료마다 다른 수치 · 조건</span></div>
      </div>
      <h2>티링크 제품의 기술적 차별점</h2><div class="grid g3">${usp}</div>
      <h2>어느 시장부터 공략할까</h2><p class="note">근거가 있는 기준만 점수를 매기고 합산은 프로그램이 합니다. 매출 예측이 아니라 지금 가진 자료로 본 우선순위입니다.</p><div class="grid g4">${markets}</div>
      <h2>누가 구매를 결정하나</h2><div class="grid g3">${people}</div>
      <h2>조심해서 써야 하는 수치</h2><p class="note">자료마다 값이나 조건이 다른 항목입니다. 값을 정해 두면 그 값은 확인 표시 없이 쓸 수 있고, 정하지 않은 값은 검수에서 걸립니다.</p>${conflicts}${enc}
      <h2>확인한 사실 ${sum.사실}개 찾아보기</h2>
      <div class="grid" style="grid-template-columns:1fr 3fr;margin-bottom:8px"><select id="f-kind"><option value="">유형 전체</option>${kinds.map((k) => `<option>${esc(k)}</option>`).join("")}</select>
      <input type="text" id="f-q" placeholder="예: 한국전력, 99%, 학교"></div><div class="tbl" id="f-table"></div>`;
    $$("#tab-analysis .pick input").forEach((el) => el.addEventListener("change", () => {
      const item = el.closest(".pick").dataset.item;
      if (el.value === "") delete S.confirmed[item]; else S.confirmed[item] = Number(el.value);
      store.set("fm_confirmed", S.confirmed);
      $$("label", el.closest(".pick")).forEach((l) => l.classList.toggle("on", l.contains(el)));
      toast(el.value === "" ? `‘${item}’은 다시 확인이 필요한 값으로 둡니다.` : `‘${item}’을 정했습니다. 검수와 다음 생성에 반영됩니다.`);
      if (S.rv.key) runCheck();
    }));
    const paint = () => {
      const q = $("#f-q").value.trim().toLowerCase(), k = $("#f-kind").value;
      const rows = S.cards.filter((c) => (!k || c.유형 === k) && (!q || (c.id + c.내용 + c.원문).toLowerCase().includes(q)));
      $("#f-table").innerHTML = `<table><tr><th>내용</th><th>유형</th><th>출처</th></tr>${rows.slice(0, 80).map((c) => `<tr class="click" data-id="${esc(c.id)}"><td>${esc(c.내용)}</td><td>${esc(c.유형)}</td><td>${esc(c.출처)}</td></tr>`).join("")}</table>
        <p class="note" style="padding:6px 10px">${rows.length}개${rows.length > 80 ? " 중 80개" : ""}. 줄을 누르면 원문 구절이 나옵니다.</p>`;
      $$("#f-table tr.click").forEach((tr) => tr.addEventListener("click", () => {
        const next = tr.nextElementSibling;
        if (next && next.classList.contains("q")) { next.remove(); return; }
        tr.insertAdjacentHTML("afterend", `<tr class="q"><td colspan="3">${sources([tr.dataset.id])}</td></tr>`);
      }));
    };
    $("#f-q").addEventListener("input", debounce(paint, 150)); $("#f-kind").addEventListener("change", paint); paint();
  }

  // ───────────── 2 · 콘텐츠 ─────────────
  function renderContent() {
    const B = S.base;
    $("#tab-content").innerHTML = `
      <div class="two"><div>
        <span class="step">STEP 1 · 현장 사진</span>
        <select id="c-photo">${B.사진.map((p) => `<option value="${esc(p.파일)}">${esc(photoLabel(p.파일))}</option>`).join("")}</select>
        <img id="c-img" class="photo" alt="설치 현장 사진" style="margin-top:8px">
        <div class="thumbs" id="c-thumbs">${B.사진.map((p) => `<img src="assets/photos/${esc(p.파일)}" data-p="${esc(p.파일)}" alt="${esc(photoLabel(p.파일))}" loading="lazy">`).join("")}</div>
        <p class="note" id="c-read"></p>
      </div><div>
        <span class="step">STEP 2 · 누구에게 보낼까요</span>
        <div class="lbl">목표 시장</div><div class="pills" id="c-market"></div><p class="note" id="c-warn"></p>
        <div class="lbl" style="margin-top:10px">구매 결정자</div><div class="pills" id="c-roles"></div>
        <span class="step">STEP 3 · 무엇을 만들까요</span><div class="pills" id="c-kinds"></div>
        <div class="grid g3" id="c-preview" style="margin-top:14px"></div>
        <div style="margin-top:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <button class="btn" id="c-go">콘텐츠 만들기</button>
          <input type="password" id="c-code" class="hide" placeholder="이용 코드" style="width:150px">
          <span class="note" id="c-note"></span>
        </div><div id="c-prog"></div>
      </div></div><div id="c-result" style="margin-top:22px"></div>`;
    const markets = B.시장.filter((x) => (x.설득전략 || []).length).map((x) => x.산업).concat(["공통"]);
    S.markets = markets;
    $("#c-photo").addEventListener("change", (e) => setPhoto(e.target.value));
    $$("#c-thumbs img").forEach((im) => im.addEventListener("click", () => setPhoto(im.dataset.p)));
    $("#c-code").value = sessionStorage.getItem("fm_code") || "";
    $("#c-code").addEventListener("input", (e) => sessionStorage.setItem("fm_code", e.target.value));
    $("#c-go").addEventListener("click", generate);
    setPhoto(B.사진.some((p) => p.파일 === "photo_10.jpg") ? "photo_10.jpg" : B.사진[0].파일);
  }
  function setPhoto(name) {
    S.sel.photo = name;
    const p = photoOf(name), mapped = PHOTO_MARKET[(p.업종 || "").trim()];
    if (mapped && S.markets.includes(mapped)) S.sel.market = mapped; else if (!S.sel.market) S.sel.market = S.markets[0];
    $("#c-photo").value = name; $("#c-img").src = "assets/photos/" + name;
    $$("#c-thumbs img").forEach((im) => im.classList.toggle("on", im.dataset.p === name));
    const r = p.판독 || {};
    $("#c-read").innerHTML = r.설치형태 ? `저장된 판독: 설치 형태 <b>${esc(r.설치형태)}</b>${r.현장특징 ? " · " + esc(r.현장특징) : ""} ${r.교차검증 ? chip("두 모델 판독 " + r.교차검증) : ""}` : "";
    paintPicks();
  }
  function paintPicks() {
    const pills = (id, items, cur, label, multi, on) => {
      $(id).innerHTML = items.map((v) => `<button data-v="${esc(v)}" class="${(multi ? cur.includes(v) : cur === v) ? "on" : ""}">${esc(label(v))}</button>`).join("");
      $$(id + " button").forEach((b) => b.addEventListener("click", () => on(b.dataset.v)));
    };
    pills("#c-market", S.markets, S.sel.market, (m) => MARKET_LABEL[m] || m, false, (v) => { S.sel.market = v; paintPicks(); });
    const toggle = (arr, v, all) => { const i = arr.indexOf(v); if (i >= 0) { if (arr.length > 1) arr.splice(i, 1); } else arr.push(v); arr.sort((a, b) => all.indexOf(a) - all.indexOf(b)); };
    pills("#c-roles", ROLES, S.sel.roles, (r) => ROLE_LABEL[r], true, (v) => { toggle(S.sel.roles, v, ROLES); paintPicks(); });
    pills("#c-kinds", KINDS, S.sel.kinds, (k) => k, true, (v) => { toggle(S.sel.kinds, v, KINDS); paintPicks(); });
    const p = photoOf(S.sel.photo), m = marketOf(S.sel.market), mapped = PHOTO_MARKET[(p.업종 || "").trim()];
    let warn = "";
    if (m && m.시장표시) warn += `${chip(m.시장표시)} 이 시장은 도입 사례 자료가 없어 제품 기능만 근거로 씁니다. `;
    if (S.sel.market !== "공통" && p.업종 && mapped !== S.sel.market) warn += `이 사진은 ‘${esc(p.업종)}’ 업종 현장이라 고른 시장과 다릅니다. 사진은 설치 방식의 예로만 쓰입니다.`;
    $("#c-warn").innerHTML = warn;
    const books = Object.fromEntries(((m && m.설득전략) || []).map((b) => [b.결정자, b]));
    $("#c-preview").style.gridTemplateColumns = `repeat(${Math.max(1, S.sel.roles.length)},1fr)`;
    $("#c-preview").innerHTML = S.sel.roles.map((role) => {
      const b = books[role], d = S.base.결정자.find((x) => x.역할 === role) || {};
      if (!b) return `<div class="card"><h3>${esc(ROLE_LABEL[role])}</h3><p><b>관심</b> ${esc(d.관심사)}</p><p><b>걱정</b> ${esc(d.걱정)}</p></div>`;
      const all = SIX.map(([k, n]) => `<div style="margin-top:8px">${chip((b[k] || {}).표시 || "AI 추론")}<b>${n}</b><br>${esc((b[k] || {}).글)}${sources((b[k] || {}).근거카드, 2)}</div>`).join("");
      return `<div class="card"><h3>${esc(ROLE_LABEL[role])}</h3><p><b>겪는 문제</b> ${esc(b.Problem.글)}</p><p><b>주는 가치</b> ${esc(b.Value.글)}</p><details><summary>설득 전략 전체</summary>${all}</details></div>`;
    }).join("");
    paintGo(); showResult();
  }
  function paintGo() {
    const key = keyOf(S.sel.photo, S.sel.market), saved = S.base.저장결과.find((x) => x.키 === key), have = S.results[key] || saved;
    $("#c-go").textContent = have ? "다시 만들기" : "콘텐츠 만들기";
    $("#c-go").disabled = !S.health.ai || S.busy;
    $("#c-code").classList.toggle("hide", !(S.health.ai && S.health.code_required));
    $("#c-note").textContent = !S.health.ai ? "이 서버에는 AI 키가 없어 새로 만들 수 없습니다. 저장된 조합을 골라 보세요."
      : have ? "저장된 결과가 있습니다. 다시 만들면 고른 결정자와 종류만 새로 씁니다." : "결정자마다 글을 쓰고 바로 검수합니다. 1~2분 걸립니다.";
  }
  async function getResult(key) {
    if (S.results[key]) return S.results[key];
    if (!S.base.저장결과.some((x) => x.키 === key)) return null;
    const r = await (await fetch(`d/results/${key}.json`)).json();
    r.저장됨 = true; S.results[key] = r; return r;
  }
  async function generate() {
    if (S.busy) return;
    const { photo, market } = S.sel, roles = [...S.sel.roles], kinds = [...S.sel.kinds], key = keyOf(photo, market);
    S.busy = true; paintGo();
    const res = (await getResult(key).catch(() => null)) || { 키: key, 사진: photo, 산업: market, 시장표시: (marketOf(market) || {}).시장표시 || "", 역할: {} };
    S.results[key] = res;
    const t0 = Date.now();
    $("#c-prog").innerHTML = roles.map((r) => `<div class="prog" data-r="${esc(r)}"><span class="dot"></span><b>${esc(ROLE_LABEL[r])}</b><span class="m">만드는 중…</span></div>`).join("");
    const tick = setInterval(() => $$("#c-prog .prog:not(.done):not(.err) .m").forEach((m) => { m.textContent = `만드는 중… ${Math.round((Date.now() - t0) / 1000)}초`; }), 1000);
    await Promise.all(roles.map(async (role) => {
      const row = $(`#c-prog .prog[data-r="${role}"]`);
      try {
        const out = await api("generate", { photo, market, role, kinds, ...common() });
        const e = res.역할[role] = Object.assign({}, res.역할[role] || {}, { 전략: out.결과.전략 });
        e.방금 = Object.assign({}, e.방금 || {});
        if (out.결과.카드뉴스) { e.카드뉴스 = out.결과.카드뉴스; e.카드HTML = out.결과.카드HTML; e.카드검수 = out.결과.카드검수; delete e.카드이미지; e.방금.카드뉴스 = out.생성시각; }
        DOCS.forEach(([kind, dk]) => { if (out.결과[dk]) { e[dk] = out.결과[dk]; e.방금[kind] = out.생성시각; const uid = `${key}|${role}|${dk}`; delete S.edits[uid]; delete S.approvals[uid]; } });
        e.소요초 = out.소요초; e.비용원 = out.비용원;
        res.시장표시 = out.시장표시; res.방금 = out.생성시각;
        row.classList.add("done"); $(".m", row).textContent = `만드는 데 ${out.소요초}초 · 약 ${Number(out.비용원).toLocaleString()}원`;
      } catch (err) { row.classList.add("err"); $(".m", row).textContent = err.message; }
    }));
    clearInterval(tick); store.set("fm_approvals", S.approvals);
    S.busy = false; paintGo(); showResult(); fillReviewKeys();
  }
  function docHTML(title, body, kind, status, ids) {
    const parts = kind === "영업 이메일" ? [`<div class="mail">제목 <b>${esc(title)}</b></div>`] : [`<h4>${esc(title)}</h4>`];
    let para = []; const fixed = [];
    const flush = () => { if (para.length) { parts.push("<p>" + para.join(" ") + "</p>"); para = []; } };
    String(body || "").split("\n").map((l) => l.trim()).filter(Boolean).forEach((line) => {
      if (line.startsWith("■")) { flush(); parts.push(`<h6>${esc(line.replace(/^■\s*/, ""))}</h6>`); }
      else if (line.startsWith("[신규 시장 제안]")) { flush(); parts.push(`<div class="mark">${esc(line)}</div>`); }
      else if ((line.startsWith("#") && !line.startsWith("#{")) || line.startsWith("※") || FOOTER.some((f) => line.includes(f))) fixed.push(esc(line));
      else {
        const st = status && status[line], cls = st === "차단" ? "blk" : st === "검토 필요" ? "rev" : "";
        const tag = ids && ids[line] ? ids[line].map((i) => `<span class="id">${esc(i)}</span>`).join("") : "";
        para.push(`<span class="${cls}">${esc(line)}</span>${tag}`);
        if (kind === "영업 이메일") flush();
      }
    });
    flush();
    if (fixed.length) parts.push(`<div class="fix">${fixed.join("<br>")}</div>`);
    return `<div class="doc">${parts.join("")}</div>`;
  }
  function cardsHTML(e) {
    const cards = e.카드뉴스 || [], checks = e.카드검수 || [];
    return `<div class="cards4">${cards.map((c, i) => {
      const pic = e.카드HTML && e.카드HTML[i] ? `<div class="frame"><iframe scrolling="no" title="카드뉴스 ${i + 1}장" data-i="${i}"></iframe></div>`
        : e.카드이미지 && e.카드이미지[i] ? `<img src="${esc(e.카드이미지[i])}" alt="카드뉴스 ${i + 1}장" loading="lazy">`
          : `<div class="card"><h3>${esc(c.제목)}</h3>${(c.본문 || []).map((b) => `<p>${esc(b)}</p>`).join("")}</div>`;
      const ck = checks[i];
      return `<div>${pic}<div class="under">${ck ? chip(ck.상태) : ""}${ck ? (ck.문제 || []).map((x) => `<span class="note">${esc(x.설명)}</span>`).join("") : ""}${evid(c.근거카드)}</div></div>`;
    }).join("")}</div>`;
  }
  function mountFrames(root, e) {
    $$("iframe[data-i]", root).forEach((f) => { f.srcdoc = e.카드HTML[Number(f.dataset.i)]; });
    fitFrames();
  }
  function fitFrames() { $$(".frame").forEach((f) => { if (f.clientWidth) f.firstElementChild.style.transform = `scale(${f.clientWidth / 1080})`; }); }
  async function showResult() {
    const box = $("#c-result"), key = keyOf(S.sel.photo, S.sel.market);
    let res = null;
    try { res = await getResult(key); } catch (e) { res = null; }
    if (key !== keyOf(S.sel.photo, S.sel.market)) return;
    if (!res) {
      const made = S.base.저장결과.map((x) => `${photoLabel(x.사진)} → ${MARKET_LABEL[x.산업] || x.산업}`).join(", ");
      box.innerHTML = `<div class="banner">이 조합으로 만든 콘텐츠가 아직 없습니다. 만들어 둔 조합: ${esc(made)}</div>`; return;
    }
    const roles = S.sel.roles.filter((r) => res.역할[r]).length ? S.sel.roles.filter((r) => res.역할[r]) : Object.keys(res.역할);
    const v = S.view[key] = S.view[key] || {};
    if (!roles.includes(v.role)) v.role = roles[0];
    const e = res.역할[v.role], have = (e.카드뉴스 && e.카드뉴스.length ? ["카드뉴스"] : []).concat(DOCS.filter(([, dk]) => e[dk]).map(([k]) => k));
    if (!have.length) { box.innerHTML = `<div class="banner">이 결정자에게 만든 콘텐츠가 아직 없습니다.</div>`; return; }
    if (!have.includes(v.kind)) v.kind = have[0];
    const fresh = e.방금 && e.방금[v.kind];
    const stamp = fresh ? `${chip("방금 생성")} ${esc(fresh)}${e.소요초 != null ? ` · 만드는 데 ${e.소요초}초 · 약 ${Number(e.비용원 || 0).toLocaleString()}원` : ""}`
      : `저장된 결과 · ${esc((e.생성시각 || {})[v.kind] || res.생성시각 || "")} 생성`;
    let body = "";
    if (v.kind === "카드뉴스") body = cardsHTML(e);
    else {
      const doc = e[DOCKEY[v.kind]], n = doc.문장.length, f = doc.문장.filter((s) => (s.근거카드 || []).length).length;
      const ids = S.showIds ? Object.fromEntries(doc.문장.map((s) => [s.글.trim(), s.근거카드 || []])) : null;
      body = `<p class="note">${n}문장 중 ${f}문장에 자료 근거가 있습니다. <label style="margin-left:10px;cursor:pointer"><input type="checkbox" id="c-ids" ${S.showIds ? "checked" : ""}> 문장마다 근거 번호 보기</label></p>${docHTML(doc.제목, doc.본문, v.kind, null, ids)}`;
    }
    box.innerHTML = `<div class="subtabs">${roles.map((r) => `<button data-r="${esc(r)}" class="${r === v.role ? "on" : ""}">${esc(ROLE_LABEL[r])}에게</button>`).join("")}</div>
      <div class="seg">${have.map((k) => `<button data-k="${esc(k)}" class="${k === v.kind ? "on" : ""}">${esc(k)}</button>`).join("")}</div>
      <span class="note" style="margin-left:12px">${stamp}</span>${body}
      <p style="margin-top:16px"><button class="btn line sm" id="c-toreview">이 콘텐츠를 검수하고 승인하기 →</button></p>`;
    $$("#c-result .subtabs button").forEach((b) => b.addEventListener("click", () => { v.role = b.dataset.r; showResult(); }));
    $$("#c-result .seg button").forEach((b) => b.addEventListener("click", () => { v.kind = b.dataset.k; showResult(); }));
    const ids = $("#c-ids"); if (ids) ids.addEventListener("change", () => { S.showIds = ids.checked; showResult(); });
    $("#c-toreview").addEventListener("click", () => { S.rv.key = key; S.rv.role = v.role; S.rv.kind = v.kind === "카드뉴스" ? null : v.kind; switchTab("review"); fillReviewKeys(); loadReview(); });
    if (v.kind === "카드뉴스") mountFrames(box, e);
  }

  // ───────────── 3 · 검수와 승인 ─────────────
  function renderReviewShell() {
    $("#tab-review").innerHTML = `
      <div class="ctl"><div><label for="r-key">콘텐츠</label><select id="r-key"></select></div>
        <div><span class="lbl">받는 사람</span><div class="pills" id="r-role"></div></div><div><span class="lbl">종류</span><div class="pills" id="r-kind"></div></div></div>
      <div id="r-ban"></div><div class="rv"><div id="r-doc"></div><div id="r-issues"></div></div>
      <h2>AI에게 고쳐 달라고 하기</h2>
      <div class="grid" style="grid-template-columns:4fr 1.1fr;align-items:start"><textarea id="r-req" rows="3" placeholder="고치고 싶은 점을 적어 주세요. 예: 도입부를 두 문장으로 줄이고, 행정실장이 읽는다고 생각하고 써 주세요 / 표지 제목을 질문형으로 바꿔 주세요"></textarea>
        <div><div class="pills" id="r-target" style="margin-bottom:8px"></div><button class="btn" id="r-revise" style="width:100%">고쳐 주세요</button></div></div>
      <p class="note" id="r-revnote">고친 결과도 같은 검수를 받습니다. 자료에 없는 수치나 과장 표현은 요청해도 넣지 않고, 들어가면 검수가 막습니다.</p><div id="r-log"></div>
      <details class="wide" id="r-edit"><summary>원고 직접 고치기 (고치면 바로 다시 검사합니다)</summary>
        <p class="note">일부러 틀린 문장을 넣어 검수가 잡는지 볼 수 있습니다.</p>
        <div class="five">${INJECT.map(([n], i) => `<button class="btn line sm" data-inj="${i}">${esc(n)}</button>`).join("")}<button class="btn line sm" id="r-reset">처음 원고로 되돌리기</button></div>
        <span class="lbl">제목</span><input type="text" id="r-title"><span class="lbl" style="margin-top:8px">본문</span><textarea id="r-body" rows="14"></textarea></details>
      <details class="wide" id="r-cardbox"><summary>카드뉴스 4장</summary><div id="r-cards"></div></details>
      <details class="wide hide" id="r-missionbox"><summary>티링크 블로그 가이드라인 미션</summary><div class="tbl" id="r-missions"></div></details>
      <h2>승인하고 내려받기</h2>
      <div class="grid" style="grid-template-columns:3fr 2fr;align-items:start"><div>
        <label id="r-seenbox" style="display:block;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="r-seen"> <span id="r-seentext"></span></label>
        <input type="text" id="r-memo" placeholder="확인 기록 (예: 표현 문장이라 그대로 둠)" style="margin-bottom:10px">
        <div id="r-apstate"></div><button class="btn" id="r-approve">이 원고를 승인</button></div>
        <div><p class="note" id="r-dlnote"></p><button class="btn" id="r-download">승인한 결과물 내려받기</button>
        <p class="note">게시용 원고(내부 확인 표시를 뺀 글), 문장별 출처가 적힌 근거 보고서, 카드뉴스가 들어 있습니다.</p></div></div>
      <h2>더 보기</h2>
      <details class="wide"><summary>쓰지 않을 표현 등록 (검수와 다음 생성에 바로 적용)</summary>
        <div class="grid" style="grid-template-columns:2fr 2fr 3fr 1fr;margin-top:6px"><input type="text" id="u-ban" placeholder="쓰지 않을 표현 (예: 혁신적인)"><input type="text" id="u-rep" placeholder="대신 쓸 표현 (예: 새로운)">
        <input type="text" id="u-why" placeholder="이유 (예: 과장으로 읽힘)"><button class="btn sm" id="u-add">등록</button></div><div id="u-list" style="margin-top:8px"></div></details>
      <details class="wide"><summary>검수가 믿을 만한지 시험하기</summary><p class="note">세 시험 모두 AI 없이 프로그램이 실행합니다. 합격 기준: 검출률 90% 이상, 오탐률 10% 이하, 표현 변형 오탐 0건.</p>
        <button class="btn sm" id="t-run">시험 실행</button><div id="t-out" style="margin-top:10px"></div></details>
      <details class="wide"><summary>누가 무엇을 판단하나</summary><div class="tbl" style="margin-top:6px"><table>
        <tr><th>판단</th><th>맡는 쪽</th><th>방법</th></tr>
        <tr><td>숫자가 자료에 있는가</td><td>프로그램</td><td>숫자와 단위를 맞춰 자료와 대조 (‘약 200개’, ‘200여 개’, ‘30만원’도 같은 값)</td></tr>
        <tr><td>조건이 빠졌는가</td><td>프로그램</td><td>조건이 붙어야 하는 수치(99%와 ‘인터넷 전화’)는 같은 문장에 조건이 있어야 통과</td></tr>
        <tr><td>자료마다 다른 수치</td><td>프로그램</td><td>정해 둔 값이 아니면 확인 표시 없이 쓸 수 없음</td></tr>
        <tr><td>자료에서 안 된다고 한 기능</td><td>프로그램</td><td>되는 것처럼 쓰면 막음</td></tr>
        <tr><td>고객명, 개인 연락처, 과장 표현, 가이드라인</td><td>프로그램</td><td>가려진 이름 목록과 정해진 규칙으로 대조</td></tr>
        <tr><td>조건이 서로 어긋나는 자료</td><td>AI가 후보 제시 → 사람</td><td>사람이 확정</td></tr>
        <tr><td>근거 없이 쓴 문장, 자료 자체의 진위, 게시</td><td>사람</td><td>막힌 곳이 없을 때만 승인 가능</td></tr></table></div></details>`;
    $("#r-key").addEventListener("change", (e) => { S.rv.key = e.target.value; S.rv.role = null; S.rv.kind = null; loadReview(); });
    $$("#tab-review [data-inj]").forEach((b) => b.addEventListener("click", () => { const e = curEdit(); if (!e) return; e.본문 = e.본문.replace(/\s+$/, "") + "\n" + INJECT[Number(b.dataset.inj)][1]; $("#r-body").value = e.본문; runCheck(); }));
    $("#r-reset").addEventListener("click", () => { const uid = curUid(); if (!uid) return; delete S.edits[uid]; loadReview(); });
    const onEdit = debounce(() => { const e = curEdit(); if (!e) return; e.제목 = $("#r-title").value; e.본문 = $("#r-body").value; runCheck(); }, 600);
    $("#r-title").addEventListener("input", onEdit); $("#r-body").addEventListener("input", onEdit);
    $("#r-revise").addEventListener("click", revise);
    $("#r-seen").addEventListener("change", paintApprove); $("#r-approve").addEventListener("click", approve); $("#r-download").addEventListener("click", download);
    $("#u-add").addEventListener("click", () => {
      const ban = $("#u-ban").value.trim(); if (!ban) return;
      S.rules = S.rules.filter((r) => r.금지 !== ban).concat([{ 금지: ban, 대체: $("#u-rep").value.trim(), 사유: $("#u-why").value.trim() }]);
      store.set("fm_rules", S.rules); $("#u-ban").value = $("#u-rep").value = $("#u-why").value = ""; paintRules(); runCheck();
    });
    $("#t-run").addEventListener("click", runTests);
    paintRules(); fillReviewKeys();
  }
  function paintRules() {
    $("#u-list").innerHTML = S.rules.length ? `<div class="tbl"><table><tr><th>쓰지 않을 표현</th><th>대신 쓸 표현</th><th>이유</th><th></th></tr>${S.rules.map((r, i) => `<tr><td>${esc(r.금지)}</td><td>${esc(r.대체)}</td><td>${esc(r.사유)}</td><td><a href="#" data-del="${i}">지우기</a></td></tr>`).join("")}</table></div>` : `<p class="note">등록한 표현이 없습니다.</p>`;
    $$("#u-list [data-del]").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); S.rules.splice(Number(a.dataset.del), 1); store.set("fm_rules", S.rules); paintRules(); runCheck(); }));
  }
  function fillReviewKeys() {
    const sel = $("#r-key"); if (!sel) return;
    const keys = S.base.저장결과.map((x) => [x.키, `${photoLabel(x.사진)} → ${MARKET_LABEL[x.산업] || x.산업}`]);
    Object.values(S.results).forEach((r) => { if (!keys.some(([k]) => k === r.키)) keys.push([r.키, `${photoLabel(r.사진)} → ${MARKET_LABEL[r.산업] || r.산업} (방금 생성)`]); });
    sel.innerHTML = keys.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join("");
    if (!S.rv.key || !keys.some(([k]) => k === S.rv.key)) S.rv.key = (keys.find(([k]) => k === "photo_10-education") || keys[0] || [null])[0];
    sel.value = S.rv.key;
  }
  const curUid = () => (S.rv.key && S.rv.role && S.rv.kind ? `${S.rv.key}|${S.rv.role}|${DOCKEY[S.rv.kind]}` : null);
  const curEdit = () => S.edits[curUid()];
  async function loadReview() {
    if (!S.rv.key) return;
    let res;
    try { res = await getResult(S.rv.key); } catch (e) { res = null; }
    if (!res) { $("#r-ban").innerHTML = `<div class="ban mute"><div><div class="t">콘텐츠를 불러오지 못했습니다</div></div></div>`; return; }
    const roles = Object.keys(res.역할);
    if (!roles.includes(S.rv.role)) S.rv.role = roles[0];
    const e = res.역할[S.rv.role], kinds = DOCS.filter(([, dk]) => e[dk]).map(([k]) => k);
    if (!kinds.includes(S.rv.kind)) S.rv.kind = kinds[0];
    $("#r-role").innerHTML = roles.map((r) => `<button data-v="${esc(r)}" class="${r === S.rv.role ? "on" : ""}">${esc(ROLE_LABEL[r])}</button>`).join("");
    $("#r-kind").innerHTML = kinds.map((k) => `<button data-v="${esc(k)}" class="${k === S.rv.kind ? "on" : ""}">${esc(k)}</button>`).join("");
    $$("#r-role button").forEach((b) => b.addEventListener("click", () => { S.rv.role = b.dataset.v; S.rv.kind = null; loadReview(); }));
    $$("#r-kind button").forEach((b) => b.addEventListener("click", () => { S.rv.kind = b.dataset.v; loadReview(); }));
    if (!S.rv.kind) { $("#r-ban").innerHTML = `<div class="ban mute"><div><div class="t">검수할 원고가 없습니다</div><div class="s">이 결정자에게는 카드뉴스만 있습니다.</div></div></div>`; $("#r-doc").innerHTML = $("#r-issues").innerHTML = ""; return; }
    const uid = curUid(), doc = e[DOCKEY[S.rv.kind]];
    if (!S.edits[uid]) S.edits[uid] = { 제목: doc.제목, 본문: doc.본문, 문장: doc.문장.map((s) => ({ 글: s.글, 근거카드: s.근거카드 || [], 소제목: s.소제목 || "" })), 원제목: doc.제목, 원본문: doc.본문 };
    $("#r-title").value = S.edits[uid].제목; $("#r-body").value = S.edits[uid].본문;
    const targets = [S.rv.kind].concat(e.카드뉴스 && e.카드뉴스.length ? ["카드뉴스"] : []);
    S.rv.target = S.rv.kind;
    $("#r-target").innerHTML = targets.map((t) => `<button data-v="${esc(t)}" class="${t === S.rv.target ? "on" : ""}">${esc(t)}</button>`).join("");
    $$("#r-target button").forEach((b) => b.addEventListener("click", () => { S.rv.target = b.dataset.v; $$("#r-target button").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#r-revise").disabled = !S.health.ai;
    $("#r-revnote").textContent = "고친 결과도 같은 검수를 받습니다. 자료에 없는 수치나 과장 표현은 요청해도 넣지 않고, 들어가면 검수가 막습니다." + (S.health.ai ? "" : " 이 서버에는 AI 키가 없어 요청으로 고치기는 쓸 수 없고, 아래에서 직접 고칠 수 있습니다.");
    S.rv.seen = false; $("#r-seen").checked = false; S.tests = null; $("#t-out").innerHTML = "";
    paintLog(); paintCards(); await runCheck();
  }
  function paintCards() {
    const res = S.results[S.rv.key]; if (!res) return;
    const e = res.역할[S.rv.role];
    $("#r-cardbox").classList.toggle("hide", !(e.카드뉴스 && e.카드뉴스.length));
    $("#r-cards").innerHTML = cardsHTML(e); mountFrames($("#r-cards"), e);
  }
  function paintLog() {
    const logs = S.logs[curUid()] || [];
    $("#r-log").innerHTML = logs.slice(-3).reverse().map((l) => `<div class="issue log"><q>${esc(l.시각)} · ${esc(l.대상)} · “${esc(l.요청)}”</q><span class="why">${esc(l.요약)}</span>${l.소요초 != null ? `<span class="note">고치는 데 ${l.소요초}초 · 약 ${Number(l.비용원 || 0).toLocaleString()}원</span>` : ""}</div>`).join("");
  }
  async function runCheck() {
    const uid = curUid(), e = curEdit(); if (!uid || !e) return;
    const res = S.results[S.rv.key], entry = res.역할[S.rv.role], seq = (runCheck._n = (runCheck._n || 0) + 1);
    let out;
    try { out = await api("check", { title: e.제목, body: e.본문, kind: S.rv.kind, market: res.산업, sentences: e.문장, cards: entry.카드뉴스 || [], ...common() }); }
    catch (err) { out = { 검수: null, 문장: [], 오류: err.message }; }
    if (seq !== runCheck._n || uid !== curUid()) return;
    S.rv.data = out;
    if (out.카드검수) { entry.카드검수 = out.카드검수; }
    paintReview();
  }
  function paintReview() {
    const out = S.rv.data, e = curEdit(), uid = curUid(), chk = out.검수, sents = out.문장 || [];
    const edited = e.제목 !== e.원제목 || e.본문 !== e.원본문;
    const cardBlock = (out.카드검수 || []).filter((c) => c.상태 === "차단").length;
    let tone, head, sub, nums = "";
    if (!chk) { tone = "mute"; head = "검사하지 못했습니다"; sub = (out.오류 || "") + " · 검사가 끝나야 승인할 수 있습니다."; }
    else {
      const st = chk.문장통계, blocks = chk.차단 + cardBlock;
      if (blocks) { tone = "bad"; head = `수정이 필요합니다 · 막힌 곳 ${blocks}건`; sub = "빨간 문장을 고치면 승인할 수 있습니다."; }
      else if (st["검토 필요"]) { tone = "warn"; head = "게시할 수 있습니다 · 확인할 문장이 있습니다"; sub = `자료 근거 없이 쓴 문장 ${st["검토 필요"]}개를 읽어 보고 승인하세요.`; }
      else { tone = "ok"; head = "게시할 수 있습니다"; sub = "자료와 어긋나는 곳이 없습니다."; }
      const ms = chk.미션 || [], cite = chk.수치인용;
      nums = `<div><b>${chk.점수}</b><span>검수 점수</span></div><div><b>${st.통과}/${sents.length}</b><span>근거 있는 문장</span></div>`
        + (ms.length ? `<div><b>${ms.filter((m) => m.결과 === "통과").length}/${ms.length}</b><span>가이드라인 미션</span></div>` : "")
        + (cite && cite.수치 ? `<div><b>${cite["카드에 있음"]}/${cite.수치}</b><span>수치의 출처 확인</span></div>` : "");
      $("#r-missionbox").classList.toggle("hide", !ms.length);
      $("#r-missions").innerHTML = `<table><tr><th>미션</th><th>내용</th><th>결과</th></tr>${ms.map((m) => `<tr><td>${esc(m.미션)}</td><td>${esc(m.내용)}</td><td>${chip(m.결과 === "통과" ? "통과" : "차단")}</td></tr>`).join("")}</table>`;
    }
    $("#r-ban").innerHTML = `<div class="ban ${tone}"><div><div class="t">${esc(head)}</div><div class="s">${esc(sub)}${edited ? " · 담당자가 고친 원고" : ""}</div></div><div class="n">${nums}</div></div>`;
    const status = Object.fromEntries(sents.filter((s) => s.상태 === "차단" || s.상태 === "검토 필요").map((s) => [s.글, s.상태]));
    $("#r-doc").innerHTML = docHTML(e.제목, e.본문, S.rv.kind, status, null);
    const bad = sents.filter((s) => s.상태 === "차단"), attached = new Set(sents.flatMap((s) => s.문제 || []));
    const docIssues = chk ? chk.문제.filter((i) => !attached.has(i.설명)) : [];
    let html = `<p style="margin:0 0 8px"><b>고칠 곳 ${bad.length + docIssues.length + cardBlock}건</b></p>`;
    html += bad.map((s) => `<div class="issue"><q>${esc(s.글)}</q>${(s.문제 || []).map((p) => `<span class="why">${esc(p)}</span>`).join("")}${sources(s.근거카드, 2)}</div>`).join("");
    html += docIssues.map((i) => `<div class="issue ${i.상태 === "차단" ? "" : "rev"}"><q>${esc(i.종류)}</q><span class="why">${esc(i.설명)}</span></div>`).join("");
    if (cardBlock) html += `<div class="issue"><q>카드뉴스 문구</q><span class="why">카드뉴스 ${cardBlock}장에 막힌 문구가 있습니다. 아래 ‘카드뉴스 4장’에서 확인하세요.</span></div>`;
    if (!bad.length && !docIssues.length && !cardBlock) html += `<div class="card" style="padding:12px 16px"><p>막힌 곳이 없습니다.</p></div>`;
    const rev = sents.filter((s) => s.상태 === "검토 필요");
    if (rev.length) {
      html += `<p style="margin:14px 0 8px"><b>읽어 볼 문장 ${rev.length}개</b></p>` + rev.slice(0, 6).map((s) => {
        const why = (s.문제 || []).length ? s.문제.map((p) => `<span class="why">${esc(p)}</span>`).join("")
          : s.수정됨 ? `<span class="why">담당자가 고친 문장입니다. 근거가 필요한 주장인지 확인하세요.</span>`
            : s.표시 === "확인 필요" ? `<span class="why">자료마다 내용이 달라 [확인 필요]로 표시한 문장입니다. 게시 전에 티링크에 확인하세요.</span>`
              : `<span class="why">자료 근거 없이 쓴 문장입니다. 사실처럼 읽히지 않는지 확인하세요.</span>`;
        return `<div class="issue rev"><q>${esc(s.글)}</q>${why}</div>`;
      }).join("") + (rev.length > 6 ? `<p class="note">외 ${rev.length - 6}개는 원고의 노란 밑줄로 표시되어 있습니다.</p>` : "");
    }
    $("#r-issues").innerHTML = html;
    if (e.본문 !== e.원본문) $("#r-edit").open = true;
    const ap = S.approvals[uid];
    if (ap && ap.hash !== hash(e.제목 + "\n" + e.본문)) { delete S.approvals[uid]; store.set("fm_approvals", S.approvals); toast("승인한 뒤에 원고가 바뀌어 승인이 풀렸습니다."); }
    paintCards(); paintApprove();
  }
  function paintApprove() {
    const out = S.rv.data, uid = curUid(), e = curEdit(); if (!out || !e) return;
    const chk = out.검수, cardBlock = (out.카드검수 || []).filter((c) => c.상태 === "차단").length;
    const blocked = !chk || chk.차단 > 0 || cardBlock > 0, nrev = chk ? chk.문장통계["검토 필요"] : 0, ap = S.approvals[uid];
    $("#r-seenbox").classList.toggle("hide", !nrev); $("#r-seentext").textContent = `읽어 볼 문장 ${nrev}개를 확인했습니다`;
    $("#r-seen").disabled = blocked;
    $("#r-apstate").innerHTML = ap ? `<div class="banner" style="background:#ECFDF5;border-color:#A7F3D0;color:#065F46">승인됨 · ${esc(ap.시각)}${ap.메모 ? " · " + esc(ap.메모) : ""}</div>`
      : blocked ? `<p class="note" style="color:#B91C1C">막힌 곳이 남아 있어 승인할 수 없습니다.</p>` : "";
    $("#r-approve").textContent = ap ? "승인 취소" : "이 원고를 승인";
    $("#r-approve").className = ap ? "btn line" : "btn";
    $("#r-approve").disabled = !ap && (blocked || (nrev > 0 && !$("#r-seen").checked));
    const n = approvedList().length;
    $("#r-dlnote").textContent = `승인한 원고만 담깁니다 · 지금 ${n}건`; $("#r-download").disabled = !n;
  }
  function approve() {
    const uid = curUid(), e = curEdit(); if (!uid) return;
    if (S.approvals[uid]) delete S.approvals[uid];
    else S.approvals[uid] = { hash: hash(e.제목 + "\n" + e.본문), 시각: new Date().toLocaleString("ko-KR", { hour12: false }), 메모: $("#r-memo").value.trim(), 점수: S.rv.data.검수.점수, 검토: S.rv.data.검수.문장통계["검토 필요"] };
    store.set("fm_approvals", S.approvals); paintApprove();
  }
  function approvedList() {
    const res = S.results[S.rv.key]; if (!res) return [];
    const out = [];
    Object.entries(res.역할).forEach(([role, entry]) => DOCS.forEach(([kind, dk]) => {
      if (!entry[dk]) return;
      const uid = `${S.rv.key}|${role}|${dk}`, ap = S.approvals[uid], ed = S.edits[uid];
      const title = ed ? ed.제목 : entry[dk].제목, body = ed ? ed.본문 : entry[dk].본문;
      if (ap && ap.hash === hash(title + "\n" + body)) out.push({ role, kind, dk, title, body, ap, sentences: ed ? ed.문장 : entry[dk].문장, entry });
    }));
    return out;
  }
  async function revise() {
    const uid = curUid(), e = curEdit(), req = $("#r-req").value.trim(); if (!uid || !e) return;
    if (!req) { toast("고치고 싶은 점을 적어 주세요."); return; }
    const res = S.results[S.rv.key], entry = res.역할[S.rv.role], target = S.rv.target || S.rv.kind, btn = $("#r-revise");
    btn.disabled = true; const t0 = Date.now(); const tick = setInterval(() => { btn.textContent = `고치는 중… ${Math.round((Date.now() - t0) / 1000)}초`; }, 500);
    try {
      let out;
      if (target === "카드뉴스") {
        out = await api("revise", { target: "cards", cards: entry.카드뉴스, role: S.rv.role, photo: res.사진, market: res.산업, request: req, ...common() });
        entry.카드뉴스 = out.카드뉴스; entry.카드HTML = out.카드HTML; entry.카드검수 = out.카드검수; delete entry.카드이미지;
        entry.방금 = Object.assign({}, entry.방금 || {}, { 카드뉴스: "요청으로 고침 " + now() });
        $("#r-cardbox").open = true;
      } else {
        out = await api("revise", { target: "doc", kind: S.rv.kind, title: e.제목, body: e.본문, sentences: e.문장, market: res.산업, request: req, ...common() });
        e.제목 = out.제목; e.본문 = out.본문; e.문장 = out.원문장; $("#r-title").value = e.제목; $("#r-body").value = e.본문;
      }
      (S.logs[uid] = S.logs[uid] || []).push({ 시각: now(), 대상: target, 요청: req, 요약: out.변경요약, 소요초: out.소요초, 비용원: out.비용원 });
      $("#r-req").value = ""; paintLog(); await runCheck(); toast("고쳤습니다. 바로 다시 검수했습니다.");
    } catch (err) { toast("고치지 못했습니다: " + err.message, 6000); }
    clearInterval(tick); btn.textContent = "고쳐 주세요"; btn.disabled = !S.health.ai;
  }
  async function runTests() {
    const e = curEdit(), res = S.results[S.rv.key]; if (!e) return;
    $("#t-out").innerHTML = `<p class="note">시험하는 중…</p>`;
    try {
      const t = await api("tests", { title: e.제목, body: e.본문, kind: S.rv.kind, market: res.산업, ...common() });
      const inj = t.주입, fp = t.오탐, vt = t.변형;
      const tbl = (rows, cols) => `<div class="tbl" style="max-height:240px;margin-top:8px"><table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</table></div>`;
      $("#t-out").innerHTML = `<div class="grid g3">
        <div class="card metric"><b>${inj ? `${inj.검출} / ${inj.주입}` : "-"}</b><span>일부러 넣은 오류를 잡은 수 (검출률 ${inj ? Math.round(100 * inj.검출 / inj.주입) : "-"}%)</span>${inj ? tbl(inj.표, ["일부러 넣은 오류", "결과", "검출 내용"]) : ""}</div>
        <div class="card metric"><b>${fp.오탐률}%</b><span>맞는 문장 ${fp["정상 문장"]}개 중 ${fp["잘못 걸림"]}개를 잘못 잡음 (오탐률)</span>${fp.표.length ? tbl(fp.표, ["문장", "잘못 걸린 이유"]) : ""}</div>
        <div class="card metric"><b>${vt["잘못 걸림"]}건</b><span>표현을 바꿔 쓴 수치 ${vt["변형 문장"]}문장 중 잘못 잡은 수</span>${vt.표.length ? tbl(vt.표, ["자료 표기", "바꿔 쓴 표현", "잘못 걸린 이유"]) : ""}</div></div>`;
    } catch (err) { $("#t-out").innerHTML = `<p class="note" style="color:#B91C1C">시험하지 못했습니다: ${esc(err.message)}</p>`; }
  }

  // ───────────── 내려받기 (zip, 압축 없이 묶기) ─────────────
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(({ name, data }) => {
      const nb = enc.encode(name), u8 = typeof data === "string" ? enc.encode(data) : data, crc = crc32(u8);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
      head.setUint32(14, crc, true); head.setUint32(18, u8.length, true); head.setUint32(22, u8.length, true); head.setUint16(26, nb.length, true); head.setUint16(28, 0, true);
      parts.push(new Uint8Array(head.buffer), nb, u8);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true); cd.setUint16(12, time, true); cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, u8.length, true); cd.setUint32(24, u8.length, true); cd.setUint16(28, nb.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nb); offset += 30 + nb.length + u8.length;
    });
    const csize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }
  async function download() {
    const list = approvedList(), res = S.results[S.rv.key]; if (!list.length) return;
    const btn = $("#r-download"); btn.disabled = true; btn.textContent = "묶는 중…";
    try {
      const files = [], doneCards = new Set();
      for (const a of list) {
        const dir = ROLE_LABEL[a.role].replace(/\s+/g, "_"), name = a.kind.replace(/\s+/g, "_");
        const pub = await api("publish", { title: a.title, body: a.body, kind: a.kind }).catch(() => ({ 제목: a.title, 본문: a.body, 게시용: false }));
        files.push({ name: `${dir}/${name}_게시용.txt`, data: `${pub.제목}\n\n${pub.본문}\n` });
        const ck = await api("check", { title: a.title, body: a.body, kind: a.kind, market: res.산업, sentences: a.sentences, ...common() });
        const lines = [`# 근거 보고서 — ${ROLE_LABEL[a.role]} · ${a.kind}`, "", `- 콘텐츠: ${photoLabel(res.사진)} → ${MARKET_LABEL[res.산업] || res.산업}`,
          `- 승인: ${a.ap.시각} · 검수 ${a.ap.점수}점 · 확인한 문장 ${a.ap.검토}개`, `- 확인 기록: ${a.ap.메모 || "(없음)"}`, "", "| 상태 | 근거 | 문장 | 출처와 원문 |", "|---|---|---|---|"];
        (ck.문장 || []).forEach((s) => {
          const src = (s.근거카드 || []).filter((i) => S.byId[i]).map((i) => `${S.byId[i].출처}: “${S.byId[i].원문}”`).join("<br>");
          lines.push(`| ${s.상태} | ${s.표시} | ${String(s.글).replace(/\|/g, "/")} | ${src.replace(/\|/g, "/")} |`);
        });
        files.push({ name: `${dir}/${name}_근거_보고서.md`, data: lines.join("\n") });
        if (!doneCards.has(a.role) && a.entry.카드뉴스 && a.entry.카드뉴스.length) {
          doneCards.add(a.role);
          const pc = await api("cards", { photo: res.사진, role: a.role, market: res.산업, cards: a.entry.카드뉴스, publish: true, ...common() }).catch(() => null);
          if (pc) pc.카드HTML.forEach((h, i) => files.push({ name: `${dir}/카드뉴스_${i + 1}_게시용.html`, data: h.replace(/(src|url\()(=?["']?)\/assets\//g, `$1$2${location.origin}/assets/`) }));
          if (a.entry.카드이미지 && !a.entry.카드HTML) for (let i = 0; i < a.entry.카드이미지.length; i++) {
            const buf = await (await fetch(a.entry.카드이미지[i])).arrayBuffer(); files.push({ name: `${dir}/카드뉴스_${i + 1}_검수용.jpg`, data: new Uint8Array(buf) });
          }
        }
      }
      files.push({ name: "읽어 주세요.txt", data: "팩트마케터 for 티링크에서 승인한 결과물입니다.\n- _게시용.txt: 내부 확인 표시를 뺀 원고\n- _근거_보고서.md: 문장마다 상태와 출처, 원문 구절\n- 카드뉴스_게시용.html: 브라우저로 열어 저장하거나 캡처해 쓰는 카드뉴스 (1080×1350)\n- 카드뉴스_검수용.jpg: 출처 표시가 들어 있는 검수용 이미지\n" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(zip(files)); a.download = `팩트마케터_${S.rv.key}.zip`; document.body.appendChild(a); a.click(); a.remove();
      toast(`승인한 원고 ${list.length}건을 내려받았습니다.`);
    } catch (err) { toast("내려받지 못했습니다: " + err.message, 6000); }
    btn.textContent = "승인한 결과물 내려받기"; btn.disabled = false;
  }

  // ───────────── 시작 ─────────────
  function switchTab(name) {
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    $$("section.tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + name));
    fitFrames();
    if (name === "review" && !S.rv.data) loadReview();
    try { history.replaceState(null, "", "#" + name); } catch (e) { /* 무시 */ }
  }
  async function init() {
    try {
      const [base, cards] = await Promise.all([fetch("d/base.json").then((r) => r.json()), fetch("d/cards.json").then((r) => r.json())]);
      S.base = base; S.cards = cards; S.byId = Object.fromEntries(cards.map((c) => [c.id, c]));
    } catch (e) { $("#tab-analysis").innerHTML = `<div class="banner">자료를 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</div>`; return; }
    try { S.health = await fetch("/api/health").then((r) => r.json()); } catch (e) { S.health = { ai: false, code_required: false, down: true }; }
    const mode = $("#mode");
    if (S.health.down) { mode.textContent = "검수 서버에 연결하지 못했습니다. 분석과 저장된 콘텐츠는 볼 수 있지만 검수 · 만들기는 잠시 뒤 다시 해 주세요."; mode.classList.remove("hide"); }
    else if (!S.health.ai) { mode.textContent = "지금은 보기와 검수만 됩니다. 저장된 결과를 불러와 검수 · 수정 · 승인 · 내려받기를 실제로 해 볼 수 있고, 새로 만들기와 요청으로 고치기는 서버에 AI 키를 넣으면 켜집니다."; mode.classList.remove("hide"); }
    renderAnalysis(); renderContent(); renderReviewShell();
    $$("#tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    window.addEventListener("resize", debounce(fitFrames, 100));
    const h = location.hash.replace("#", ""); if (["analysis", "content", "review"].includes(h)) switchTab(h);
  }
  init();
})();
