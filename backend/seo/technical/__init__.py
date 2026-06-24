from __future__ import annotations

from .competitor import compare
from .console import get_console_provider
from .crawlability import check_crawlability
from .models import CoreWebVitals
from .pagespeed import get_pagespeed_provider
from .service import technical_audit

__all__ = [
    "technical_audit",
    "get_pagespeed_provider",
    "get_console_provider",
    "check_crawlability",
    "compare",
    "CoreWebVitals",
]
