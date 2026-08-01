"""Independent, dependency-free reference for the cross-language hash golden."""

import hashlib
import json
import unicodedata


value = {
    "a": [3, None, "é"],
    "b": 0,
    "big": "9007199254740993",
    "nested": {"α": True},
}


def normalize(item):
    if isinstance(item, str):
        return unicodedata.normalize("NFC", item)
    if isinstance(item, list):
        return [normalize(entry) for entry in item]
    if isinstance(item, dict):
        return {unicodedata.normalize("NFC", key): normalize(entry) for key, entry in item.items()}
    return item


canonical = json.dumps(
    normalize(value), ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
)
digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
print(json.dumps({"canonical": canonical, "sha256": digest}, ensure_ascii=False))
