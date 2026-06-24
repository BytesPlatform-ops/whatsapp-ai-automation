from __future__ import annotations

from typing import List

from ...schemas import Mode, SeoPage
from . import headings, images, links, meta, schema, technical_basics

ALL_CHECKS = [
    meta.run,
    headings.run,
    schema.run,
    images.run,
    links.run,
    technical_basics.run,
]


def run_all_checks(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List
    for check in ALL_CHECKS:
        results.extend(check(page, mode))
    return results
