"""요청을 읽고 JSON 으로 답하는 공통 부분 (Vercel 함수와 로컬 시험 서버가 같이 씁니다)."""
from __future__ import annotations

import json
import re

from .core import ApiError

SECRET = re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{20,}|Bearer\s+\S+", re.I)
MAX_BODY = 2_000_000


def respond(h, fn) -> None:
    """h: BaseHTTPRequestHandler. fn(payload: dict) -> dict"""
    status, out = 200, {}
    try:
        payload = {}
        if h.command == "POST":
            n = int(h.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise ApiError(413, "요청이 너무 큽니다.")
            raw = h.rfile.read(n) if n else b""
            payload = json.loads(raw.decode("utf-8")) if raw.strip() else {}
            if not isinstance(payload, dict):
                raise ApiError(400, "요청 형식이 맞지 않습니다.")
        out = fn(payload)
    except ApiError as e:
        status, out = e.status, {"error": e.message}
    except json.JSONDecodeError:
        status, out = 400, {"error": "요청 형식이 맞지 않습니다."}
    except Exception as e:  # noqa: BLE001 — 실패 사유를 화면에 알려 주되, 키처럼 보이는 글자는 지웁니다
        detail = SECRET.sub("(가림)", str(e))[:240]
        status, out = 500, {"error": f"처리하지 못했습니다 ({type(e).__name__}). 잠시 뒤 다시 해 주세요.", "detail": detail}
    body = json.dumps(out, ensure_ascii=False).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Cache-Control", "no-store")
    h.send_header("Content-Length", str(len(body)))
    h.end_headers()
    h.wfile.write(body)
