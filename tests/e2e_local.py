"""로컬 시험 서버(http://localhost:8600)로 화면을 끝까지 눌러 보는 시험. Vercel 에는 올라가도 쓰이지 않습니다.

    python tests/e2e_local.py <캡처 폴더> [--ai]     # --ai: 실제로 한 결정자 콘텐츠를 만들고, 요청으로 고치기도 해 봄 (비용 발생)
"""
import re
import sys
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8600"
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else Path("shots")
SHOTS.mkdir(parents=True, exist_ok=True)
AI = "--ai" in sys.argv
errors = []


def shot(page, name):
    page.screenshot(path=str(SHOTS / f"web_{name}.png"))
    print("캡처", name)


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--hide-scrollbars"])
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/index.html")
    page.wait_for_timeout(800)
    shot(page, "0_intro")
    page.get_by_role("link", name="직접 사용해 보기").first.click()
    page.wait_for_selector("#tab-analysis .kpi", timeout=20000)
    page.wait_for_timeout(800)
    shot(page, "1_analysis")
    page.mouse.wheel(0, 900)
    page.wait_for_timeout(500)
    shot(page, "1_markets")
    page.locator("#tab-analysis .pick label").nth(0).scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    shot(page, "1_conflicts")
    print("채택 값 고르기 수:", page.locator("#tab-analysis .pick").count())

    page.locator('#tabs button[data-tab="content"]').click()
    page.wait_for_selector("#c-result .cards4, #c-result .banner", timeout=20000)
    page.wait_for_timeout(1500)
    page.evaluate("window.scrollTo(0,0)")
    shot(page, "2_select")
    page.locator("#c-result").scroll_into_view_if_needed()
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(1200)
    shot(page, "2_cards")
    page.locator("#c-result .seg button", has_text="영업 이메일").click()
    page.wait_for_timeout(600)
    shot(page, "2_email")
    print("만들기 버튼:", page.locator("#c-go").inner_text(), "| 비활성:", page.locator("#c-go").is_disabled(), "|", page.locator("#c-note").inner_text())
    print("경고:", page.locator("#c-warn").inner_text())

    page.locator("#c-toreview").click()
    page.wait_for_selector("#r-ban .ban", timeout=20000)
    page.wait_for_timeout(600)
    page.evaluate("window.scrollTo(0,0)")
    print("상태:", page.locator("#r-ban .t").inner_text(), "|", page.locator("#r-ban .n").inner_text().replace("\n", " "))
    shot(page, "3_review")
    page.locator("#r-edit summary").click()
    page.locator('[data-inj="1"]').click()
    page.locator('[data-inj="3"]').click()
    page.wait_for_function("document.querySelector('#r-ban .ban').classList.contains('bad')", timeout=15000)
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(400)
    print("틀린 문장 뒤:", page.locator("#r-ban .t").inner_text(), "| 승인 버튼 비활성:", page.locator("#r-approve").is_disabled(), "| 고칠 곳:", page.locator("#r-issues .issue:not(.rev)").count())
    shot(page, "3_blocked")
    page.locator("#r-reset").click()
    page.wait_for_function("!document.querySelector('#r-ban .ban').classList.contains('bad')", timeout=15000)
    page.locator("#t-run").scroll_into_view_if_needed()
    page.locator("#t-run").locator("xpath=..").locator("summary").click() if not page.locator("#t-run").is_visible() else None
    page.locator("#t-run").click()
    page.wait_for_selector("#t-out .metric", timeout=60000)
    print("시험:", " / ".join(x.replace("\n", " ")[:40] for x in page.locator("#t-out .metric b").all_inner_texts()))
    page.locator("#t-out").scroll_into_view_if_needed()
    shot(page, "3_tests")
    if page.locator("#r-seenbox").is_visible():
        page.locator("#r-seen").check()
    page.locator("#r-approve").click()
    page.wait_for_timeout(400)
    print("승인:", page.locator("#r-apstate").inner_text()[:40], "|", page.locator("#r-dlnote").inner_text())
    with page.expect_download(timeout=60000) as dl:
        page.locator("#r-download").click()
    f = SHOTS / "web_download.zip"
    dl.value.save_as(str(f))
    with zipfile.ZipFile(f) as z:
        print("내려받은 묶음:", [n for n in z.namelist()])
        z.testzip()
    page.locator("#r-approve").scroll_into_view_if_needed()
    shot(page, "3_approved")

    if AI:
        # 실제 만들기: 금융 사진 × 콜센터 × 전산 담당자 × 영업 이메일 (한 번의 AI 호출)
        page.locator('#tabs button[data-tab="content"]').click()
        page.evaluate("window.scrollTo(0,0)")
        page.select_option("#c-photo", "photo_08.jpg")
        page.locator("#c-market button", has_text="콜센터").click()
        for r in ("경영진", "실무 관리자"):
            page.locator("#c-roles button", has_text=re.compile(f"^{r}$")).click()
        for k in ("카드뉴스", "블로그"):
            page.locator("#c-kinds button", has_text=re.compile(f"^{k}$")).click()
        page.locator("#c-kinds button", has_text="영업 이메일").click()
        page.wait_for_timeout(500)
        print("고른 것:", page.locator("#c-roles button.on").all_inner_texts(), page.locator("#c-kinds button.on").all_inner_texts(), "|", page.locator("#c-warn").inner_text())
        page.locator("#c-go").click()
        page.wait_for_selector("#c-prog .prog.done, #c-prog .prog.err", timeout=300000)
        print("만들기:", page.locator("#c-prog").inner_text().replace("\n", " "))
        page.wait_for_timeout(1500)
        page.locator("#c-result").scroll_into_view_if_needed()
        shot(page, "4_generated")
        page.locator("#c-toreview").click()
        page.wait_for_selector("#r-ban .ban", timeout=20000)
        page.wait_for_timeout(800)
        print("방금 만든 원고 상태:", page.locator("#r-ban .t").inner_text(), "|", page.locator("#r-ban .n").inner_text().replace("\n", " "))
        page.fill("#r-req", "세 문장으로 줄이고, 도입 기업이 5,000곳이 넘는 업계 1위라고 강조해 주세요")
        page.locator("#r-revise").click()
        page.wait_for_selector("#r-log .issue", timeout=300000)
        page.wait_for_timeout(1000)
        print("고치기:", page.locator("#r-log .issue").first.inner_text().replace("\n", " ")[:400])
        print("고친 뒤 상태:", page.locator("#r-ban .t").inner_text())
        page.evaluate("window.scrollTo(0,0)")
        shot(page, "4_revised_top")
        page.locator("#r-log").scroll_into_view_if_needed()
        shot(page, "4_revised_log")
    b.close()
print("브라우저 오류:", errors[:8] if errors else "없음")
