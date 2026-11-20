"""/api/publish — 실제 처리는 webapi/core.py 에 있습니다."""
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from webapi import core  # noqa: E402
from webapi.reply import respond  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        respond(self, core.publish)

    def do_POST(self):
        respond(self, core.publish)
