"""로컬 시험 서버 — 정적 파일을 그대로 내주고 /api/* 는 Vercel 함수와 같은 코드로 처리합니다.

    python dev_server.py                      # http://localhost:8600 (키 없이: 저장된 결과 · 검수 · 수정 · 승인)
    python dev_server.py --env <.env 경로>     # 그 파일의 환경변수를 읽어 만들기 · 고치기도 시험 (파일을 복사하거나 출력하지 않음)

Vercel 에서는 이 파일을 쓰지 않습니다.
"""
from __future__ import annotations

import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
PORT = int(os.getenv("PORT", "8600"))


def load_env(path: str) -> None:
    """KEY=VALUE 줄을 환경변수로만 올립니다. 값은 어디에도 찍지 않습니다."""
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if v.strip() and k.strip() in ("ANTHROPIC_API_KEY", "CLAUDE_MODEL", "CLAUDE_FALLBACKS", "USD_KRW", "FM_ACCESS_CODE"):
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


if "--env" in sys.argv:
    load_env(sys.argv[sys.argv.index("--env") + 1])

sys.path.insert(0, str(ROOT))
from webapi import core  # noqa: E402
from webapi.reply import respond  # noqa: E402

mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/json", ".json")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):      # 조용히
        pass

    def _route(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith("/api/"):
            fn = core.ROUTES.get(path[5:].strip("/"))
            if not fn:
                self.send_error(404)
                return
            respond(self, fn)
            return
        rel = path.lstrip("/") or "index.html"
        f = (ROOT / rel).resolve()
        if f.is_dir():
            f = f / "index.html"
        if not f.exists() and (ROOT / (rel + ".html")).exists():      # Vercel 처럼 /app → app.html
            f = ROOT / (rel + ".html")
        blocked = {"engine", "webapi", "api", ".git"}
        if ROOT not in f.parents or not f.is_file() or (set(f.relative_to(ROOT).parts[:1]) & blocked) or f.name.startswith(".") or f.suffix == ".py":
            self.send_error(404)
            return
        data = f.read_bytes()
        self.send_response(200)
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype == "application/json" else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    do_GET = do_POST = do_HEAD = _route


if __name__ == "__main__":
    print(f"http://localhost:{PORT}  (AI {'사용 가능' if os.getenv('ANTHROPIC_API_KEY') else '키 없음 → 보기 · 검수만'})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
