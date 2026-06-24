"""Generation — the Builder (full site) and, later, the Editor (one change).

The Builder assembles the agent prompt + calls the model layer (`models/`) and
parses the result into a `Site`. In fake mode (`PIXIE_MODEL_MODE=fake`) the model
layer returns canned output, so the whole pipe runs with no API spend. Swapping
to a real provider changes nothing here.
"""

from .builder import BuildOutput, build_site

__all__ = ["build_site", "BuildOutput"]
