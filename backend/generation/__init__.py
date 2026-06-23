"""Generation — the Builder (full site) and, later, the Editor (one change).

Step 2 ships a FAKE Builder: no model call, returns a hand-authored `Site`
lightly adapted to the message. It exists to prove the pipe (message → Site)
end-to-end and to give us a latency/shape baseline before wiring a real model
in step 4.
"""

from .builder import build_site_fake

__all__ = ["build_site_fake"]
