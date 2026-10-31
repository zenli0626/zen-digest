#!/usr/bin/env python3
"""Strip hidden-Unicode and fake-system-override payloads from a fetched page before an LLM reads it.

Usage: python3 clean-fetched.py <file>
Writes <file>.clean (payload removed). Exit 0 = clean, nothing found.
Exit 2 = hidden chars and/or override-phrase matches found and stripped.
"""
import re
import sys
import unicodedata

# Unicode tag characters (U+E0000-U+E007F) and other invisible/formatting
# characters commonly abused to smuggle text past human review while an
# LLM's tokenizer still sees it.
HIDDEN_RANGES = [
    (0xE0000, 0xE007F),  # Unicode tags block
    (0x200B, 0x200F),    # zero-width space/joiners, LTR/RTL marks
    (0x202A, 0x202E),    # bidi embedding/override controls
    (0x2060, 0x2064),    # word joiner, invisible operators
    (0xFE00, 0xFE0F),    # variation selectors
    (0xFFF9, 0xFFFB),    # interlinear annotation controls
]

OVERRIDE_PATTERNS = [
    r"system\s*override",
    r"ignore (all |your )?(previous|prior|above) instructions",
    r"you are now (in|operating in) \w+ mode",
    r"disregard (all |your )?(safety|previous) (guidelines|instructions)",
    r"\bAI (agent|assistant|model)s?[:,]?\s+(do not|must not|stop)\b",
]


def is_hidden(cp: int) -> bool:
    return any(lo <= cp <= hi for lo, hi in HIDDEN_RANGES)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: clean-fetched.py <file>", file=sys.stderr)
        return 1
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    hidden_count = sum(1 for ch in text if is_hidden(ord(ch)))
    cleaned = "".join(ch for ch in text if not is_hidden(ord(ch)))
    cleaned = unicodedata.normalize("NFC", cleaned)

    override_hits = []
    for pat in OVERRIDE_PATTERNS:
        for m in re.finditer(pat, cleaned, re.IGNORECASE):
            override_hits.append(m.group(0))
            cleaned = cleaned[: m.start()] + "[REDACTED: embedded instruction text]" + cleaned[m.end() :]

    out_path = path + ".clean"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(cleaned)

    if hidden_count or override_hits:
        print(f"Found {hidden_count} hidden-Unicode char(s) and {len(override_hits)} override-phrase match(es).")
        if override_hits:
            print("Matched phrases:", override_hits[:5])
        print(f"Cleaned copy written to {out_path}")
        return 2

    print(f"Clean. Copy written to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
