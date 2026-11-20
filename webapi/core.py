"""웹 함수의 공통 로직 — engine/kit 의 엔진을 그대로 불러 씁니다.

- 키는 환경변수(ANTHROPIC_API_KEY)에서만 읽고, 응답·로그·파일 어디에도 쓰지 않습니다.
- 검수(check · tests)는 AI 를 쓰지 않으므로 키가 없어도 작동합니다.
- 만들기(generate) · 고치기(revise)는 키가 있어야 하고, FM_ACCESS_CODE 가 설정되어 있으면 그 코드도 맞아야 합니다.
- 사진은 다시 읽지 않고 저장해 둔 판독 결과를 씁니다. 파일을 쓰지 않습니다.
"""
from __future__ import annotations

import hmac
import inspect
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))
os.environ.setdefault("LLM_CACHE", "0")          # 서버에서는 AI 응답을 저장해 두고 다시 쓰지 않습니다 (만들 때마다 실제로 만듦)

ROLES = ["경영진", "영업 관리자", "전산·총무 담당"]
KINDS = ["카드뉴스", "블로그", "도입 사례", "영업 이메일"]
DOC_KEY = {"블로그": "블로그", "도입 사례": "도입사례", "영업 이메일": "이메일"}
FONT_URL = "/assets/fonts/PretendardVariable.woff2"
KST = timezone(timedelta(hours=9))
_lock = threading.Lock()
_S: dict = {}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def _json(name: str, default=None):
    try:
        return json.loads((ENGINE / "data" / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def S() -> dict:
    """엔진 자료를 한 번만 읽어 둡니다."""
    if "cards" not in _S:
        with _lock:
            if "cards" not in _S:
                from kit import verify
                cards = _json("cards.json", [])
                conflicts = _json("conflicts.json", [])
                photos = _json("photos.json", [])
                st = {"conflicts": conflicts, "photos": {p["파일"]: p for p in photos}, "photo_list": photos,
                      "strategy": _json("strategy.json", {"항목": [], "결정자": []}), "industry": _json("industry.json", {"산업": []}),
                      "readings": _json("readings.json", {}), "by_id": {c["id"]: c for c in cards},
                      "valid": {c["id"] for c in cards if c.get("원문확인")}}
                try:
                    st["guideline"] = (ENGINE / "data" / "guideline.txt").read_text(encoding="utf-8")
                except OSError:
                    st["guideline"] = ""
                st["ledger"] = verify.build_ledger(cards, conflicts, photos) if cards else None
                st["cards"] = cards
                _S.update(st)
    return _S


def _has(func, name: str) -> bool:
    try:
        return name in inspect.signature(func).parameters
    except (TypeError, ValueError):
        return False


def _call(func, *args, **optional):
    """엔진 함수가 받는 선택 인자만 골라 넘깁니다 (엔진이 바뀌어도 웹 쪽이 깨지지 않게)."""
    return func(*args, **{k: v for k, v in optional.items() if _has(func, k)})


def _text(v, limit: int) -> str:
    return str(v or "")[:limit]


def _rules(p: dict) -> list[dict]:
    out = []
    for r in (p.get("rules") or [])[:30]:
        if isinstance(r, dict) and str(r.get("금지") or "").strip():
            out.append({"금지": _text(r.get("금지"), 60).strip(), "대체": _text(r.get("대체"), 60).strip(), "사유": _text(r.get("사유"), 120).strip()})
    return out


def _confirmed(p: dict) -> dict:
    out = {}
    for k, v in (p.get("confirmed") or {}).items():
        try:
            out[_text(k, 40)] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def _ledger(p: dict):
    from kit import verify
    s = S()
    conf = _confirmed(p)
    if conf and _has(verify.build_ledger, "confirmed"):
        return verify.build_ledger(s["cards"], s["conflicts"], s["photo_list"], confirmed=conf)
    return s["ledger"]


def _market(p: dict) -> str | None:
    m = p.get("market")
    if not m or m == "공통":
        return None
    if m not in {x["산업"] for x in S()["industry"]["산업"]}:
        raise ApiError(400, "목표 시장을 다시 골라 주세요.")
    return m


def _profile(market: str | None) -> dict | None:
    return next((x for x in S()["industry"]["산업"] if x["산업"] == market), None) if market else None


def _kind(p: dict) -> str:
    k = p.get("kind") or "블로그"
    if k not in KINDS:
        raise ApiError(400, "콘텐츠 종류를 다시 골라 주세요.")
    return k


def _sentences(p: dict) -> list[dict]:
    out = []
    for s in (p.get("sentences") or [])[:400]:
        if isinstance(s, dict) and s.get("글"):
            out.append({"글": _text(s["글"], 2000), "근거카드": [str(c) for c in (s.get("근거카드") or [])][:20], "소제목": _text(s.get("소제목"), 100)})
    return out


def _review(title: str, body: str, sentences: list[dict], ledger, rules, kind: str, market: str | None) -> dict:
    from kit import verify
    s = S()
    return _call(verify.review, title, body, sentences, ledger, rules, s["valid"], s["by_id"], kind=kind, market=market)


def _card_checks(cards4: list[dict], ledger, rules, market: str | None) -> list[dict]:
    from kit import verify
    out = []
    for c in cards4:
        text = "\n".join([str(c.get("제목", "")), *[str(b) for b in c.get("본문", [])]])
        try:
            r = _call(verify.check, "", text, ledger, rules, doc_level=False, kind="카드뉴스", market=market)
            out.append({"상태": r["상태"], "문제": [{"종류": i["종류"], "설명": i["설명"]} for i in r["문제"]]})
        except Exception:  # noqa: BLE001 — 검사 실패는 '미검사'
            out.append({"상태": "미검사", "문제": []})
    return out


def _card_html(cards4: list[dict], role: str, photo: str, market: str | None, publish: bool = False) -> list[str]:
    from kit import cardnews
    s = S()
    meta = s["photos"].get(photo) or {}
    prof = _profile(market) or {}
    extra = {}
    if _has(cardnews.page_html, "publish"):
        extra["publish"] = publish
    if _has(cardnews.page_html, "role_label") and prof.get("호칭"):
        label = (prof.get("호칭") or {}).get(role)
        if label:
            extra["role_label"] = label
    return cardnews.pages_html(cards4, role, f"/assets/photos/{photo}", (meta.get("w") or 1200, meta.get("h") or 900), meta, s["by_id"],
                               "" if publish else prof.get("시장표시", ""), font_url=FONT_URL, **extra)


def _need_ai(p: dict):
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        raise ApiError(503, "이 서버에는 AI 키가 설정되어 있지 않아 새로 만들거나 고칠 수 없습니다. 저장된 결과의 검수 · 수정 · 승인은 그대로 됩니다.")
    code = os.getenv("FM_ACCESS_CODE") or ""
    if code and not hmac.compare_digest(str(p.get("code") or "").encode("utf-8"), code.encode("utf-8")):
        raise ApiError(401, "이용 코드가 맞지 않습니다.")


def _cost():
    from kit import llm
    u = llm.usage()
    return u["krw"], u["calls"]


# ───────────────────────── 엔드포인트 ─────────────────────────
def health(p: dict) -> dict:
    return {"ai": bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")), "code_required": bool(os.getenv("FM_ACCESS_CODE")),
            "cards": len(S()["cards"]), "time": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")}


def check(p: dict) -> dict:
    """검수 (AI 없음). 원고 하나와, 함께 보낸 카드뉴스 문구를 검사합니다."""
    rules, ledger, market = _rules(p), _ledger(p), _market(p)
    out: dict = {}
    if "body" in p:
        kind = _kind(p)
        rv = _review(_text(p.get("title"), 400), _text(p.get("body"), 30000), _sentences(p), ledger, rules, kind, market)
        out.update({"검수": rv["검수"], "문장": rv["문장"], "오류": rv.get("오류", "")})
    if p.get("cards"):
        out["카드검수"] = _card_checks(p["cards"][:6], ledger, rules, market)
    return out


def tests(p: dict) -> dict:
    """검수기 시험 3종 (AI 없음): 일부러 넣은 오류를 잡는지, 맞는 문장을 잘못 잡지 않는지, 표현을 바꿔 쓴 수치."""
    from kit import verify
    s = S()
    rules, ledger, market = _rules(p), _ledger(p), _market(p)
    out = {"오탐": verify.false_positive_test(s["cards"], s["conflicts"], ledger), "변형": verify.variant_test(s["cards"], s["conflicts"], ledger)}
    if p.get("body"):
        out["주입"] = _call(verify.injection_test, _text(p.get("title"), 400), _text(p.get("body"), 30000), ledger, rules, kind=_kind(p), market=market)
    return out


def cards(p: dict) -> dict:
    """카드뉴스 4장의 화면용 HTML (브라우저가 그림). publish=true 면 게시용(내부 표시 없음)."""
    role = p.get("role")
    if role not in ROLES or p.get("photo") not in S()["photos"] or not p.get("cards"):
        raise ApiError(400, "카드뉴스 정보를 다시 보내 주세요.")
    market = _market(p)
    return {"카드HTML": _card_html(p["cards"][:6], role, p["photo"], market, publish=bool(p.get("publish"))),
            "카드검수": _card_checks(p["cards"][:6], _ledger(p), _rules(p), market)}


def publish(p: dict) -> dict:
    """게시용 본문: 내부 표시([확인 필요], [신규 시장 제안] 줄)를 뺀 글. 엔진에 그 기능이 있을 때만 바뀝니다."""
    from kit import content
    title, body, kind = _text(p.get("title"), 400), _text(p.get("body"), 30000), _kind(p)
    if hasattr(content, "publish_text"):
        title, body = content.publish_text(title, body, kind)
    return {"제목": title, "본문": body, "게시용": hasattr(content, "publish_text")}


def generate(p: dict) -> dict:
    """한 결정자에게 보낼 콘텐츠를 실제로 만듭니다 (카드뉴스 · 블로그 · 도입 사례 · 영업 이메일 중 고른 것)."""
    _need_ai(p)
    from kit import content
    s = S()
    photo, role = p.get("photo"), p.get("role")
    kinds = [k for k in KINDS if k in (p.get("kinds") or [])]
    if photo not in s["photos"] or role not in ROLES or not kinds:
        raise ApiError(400, "사진, 결정자, 콘텐츠 종류를 다시 골라 주세요.")
    market = _market(p)
    profile = _profile(market)
    playbook = next((b for b in (profile or {}).get("설득전략") or [] if b.get("결정자") == role), None)
    decider = next((d for d in s["strategy"]["결정자"] if d["역할"] == role), None)
    info = s["readings"].get(photo)
    if not decider or not info:
        raise ApiError(400, "이 사진이나 결정자의 분석 자료가 없습니다.")
    rules, ledger, conf = _rules(p), _ledger(p), _confirmed(p)
    mark = (profile or {}).get("시장표시", "")
    need_main = any(k in kinds for k in ("카드뉴스", "블로그"))
    extra = [k for k in kinds if k in ("도입 사례", "영업 이메일")]
    t0 = time.time()
    krw0, calls0 = _cost()

    def main_job():
        return _call(content.make_for_role, role, decider, info, s["cards"], s["conflicts"], s["guideline"], rules,
                     industry=profile, playbook=playbook, confirmed=conf or None)

    def extra_job():
        return _call(content.make_extra, role, decider, info, s["cards"], s["conflicts"], rules,
                     industry=profile, playbook=playbook, kinds=extra, confirmed=conf or None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_main = pool.submit(main_job) if need_main else None
        f_extra = pool.submit(extra_job) if extra else None
        main = f_main.result() if f_main else None
        raw = f_extra.result() if f_extra else None

    entry: dict = {"전략": playbook}
    if main:
        if "카드뉴스" in kinds:
            entry["카드뉴스"] = main["카드뉴스"]
            entry["카드HTML"] = _card_html(main["카드뉴스"], role, photo, market)
            entry["카드검수"] = _card_checks(main["카드뉴스"], ledger, rules, market)
        if "블로그" in kinds:
            blog = _call(content.assemble_blog, main["블로그"], market_mark=mark)
            rv = _review(blog["제목"], blog["본문"], blog["문장"], ledger, rules, "블로그", market)
            entry["블로그"] = {"제목": blog["제목"], "본문": blog["본문"], "문장": rv["문장"], "검수": rv["검수"]}
    for kind in extra:
        key = DOC_KEY[kind]
        if not raw or not raw.get(key):
            continue
        doc = _call(content.assemble_doc, raw[key], kind, market_mark=mark)
        rv = _review(doc["제목"], doc["본문"], doc["문장"], ledger, rules, kind, market)
        entry[key] = {"제목": doc["제목"], "본문": doc["본문"], "문장": rv["문장"], "검수": rv["검수"]}
    krw1, calls1 = _cost()
    return {"역할": role, "사진": photo, "산업": market or "공통", "시장표시": mark, "결과": entry,
            "생성시각": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S"), "소요초": round(time.time() - t0), "비용원": max(0, krw1 - krw0),
            "AI호출": max(0, calls1 - calls0)}


def revise(p: dict) -> dict:
    """글로 적은 요청대로 원고나 카드뉴스를 고치고, 바로 다시 검수한 결과를 돌려줍니다."""
    _need_ai(p)
    from kit import revise as rev
    s = S()
    request = _text(p.get("request"), 600).strip()
    if not request:
        raise ApiError(400, "고치고 싶은 점을 적어 주세요.")
    market = _market(p)
    mark = (_profile(market) or {}).get("시장표시", "")
    rules, ledger, conf = _rules(p), _ledger(p), _confirmed(p)
    t0 = time.time()
    krw0, _ = _cost()
    if p.get("target") == "cards":
        role, photo = p.get("role"), p.get("photo")
        if role not in ROLES or photo not in s["photos"] or not p.get("cards"):
            raise ApiError(400, "카드뉴스 정보를 다시 보내 주세요.")
        out = _call(rev.revise_cards, p["cards"][:6], request, role, s["cards"], s["conflicts"], rules, market, confirmed=conf or None)
        res = {"카드뉴스": out["카드뉴스"], "카드HTML": _card_html(out["카드뉴스"], role, photo, market),
               "카드검수": _card_checks(out["카드뉴스"], ledger, rules, market), "변경요약": out.get("변경요약") or "요청대로 고쳤습니다."}
    else:
        kind = _kind(p)
        if kind == "카드뉴스":
            raise ApiError(400, "고칠 원고를 골라 주세요.")
        out = _call(rev.revise_doc, kind, _text(p.get("title"), 400), _text(p.get("body"), 30000), _sentences(p), request,
                    s["cards"], s["conflicts"], rules, market, mark, s["guideline"], confirmed=conf or None)
        rv = _review(out["제목"], out["본문"], out["문장"], ledger, rules, kind, market)
        res = {"제목": out["제목"], "본문": out["본문"], "원문장": [{"글": x["글"], "근거카드": x.get("근거카드", []), "소제목": x.get("소제목", "")} for x in out["문장"]],
               "문장": rv["문장"], "검수": rv["검수"], "변경요약": out.get("변경요약") or "요청대로 고쳤습니다."}
    krw1, _ = _cost()
    res.update({"소요초": round(time.time() - t0), "비용원": max(0, krw1 - krw0)})
    return res


ROUTES = {"health": health, "check": check, "tests": tests, "cards": cards, "publish": publish, "generate": generate, "revise": revise}
