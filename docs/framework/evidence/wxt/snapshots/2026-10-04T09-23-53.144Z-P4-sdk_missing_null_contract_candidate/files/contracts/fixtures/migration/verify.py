#!/usr/bin/env python3
"""Stage 01 fixture integrity checker. No product converter, browser or storage code."""
import base64
import csv
import hashlib
import io
import json
import math
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
ECMASCRIPT_WHITESPACE = "\u0009\u000b\u000c\u0020\u00a0\u1680" + "".join(chr(code) for code in range(0x2000, 0x200B)) + "\u202f\u205f\u3000\ufeff\n\r\u2028\u2029"


def load(path):
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            assert key not in result, "duplicate JSON key"
            result[key] = value
        return result

    def non_finite(token):
        raise AssertionError("non-finite JSON literal: " + token)

    return json.loads((ROOT / path).read_text(encoding="utf-8"), object_pairs_hook=unique_object, parse_constant=non_finite)


def check_blob(blob):
    data = (ROOT / blob["path"]).read_bytes()
    assert data == base64.b64decode(blob["bytesBase64"], validate=True)
    assert data.decode("utf-8") == blob["text"]
    assert len(data) == blob["byteLength"]
    assert hashlib.sha256(data).hexdigest() == blob["sha256"]
    return data


def walk_blobs(value):
    if isinstance(value, dict):
        if {"path", "bytesBase64", "sha256", "byteLength", "text"} <= value.keys():
            check_blob(value)
        for child in value.values():
            walk_blobs(child)
    elif isinstance(value, list):
        for child in value:
            walk_blobs(child)


def restricted(value):
    if isinstance(value, dict):
        for key, child in value.items():
            assert key.isascii(), "non-ASCII canonical key"
            assert key not in ("__proto__", "constructor", "prototype"), "dangerous key"
            restricted(child)
    elif isinstance(value, list):
        for child in value:
            restricted(child)
    elif type(value) is int:
        assert abs(value) <= 9007199254740991, "unsafe integer"
    elif isinstance(value, str):
        assert not any(0xD800 <= ord(char) <= 0xDFFF for char in value), "unpaired surrogate"
    else:
        assert value is None or type(value) in (str, bool), "non-integer template number"


def canonical(value):
    restricted(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def schema_shape(value, spec):
    """Check only the schema keywords authored here, without third-party dependencies."""
    if "const" in spec:
        assert value == spec["const"]
    if "enum" in spec:
        assert value in spec["enum"]
    if "type" in spec:
        allowed = spec["type"] if isinstance(spec["type"], list) else [spec["type"]]
        kinds = {dict: "object", list: "array", str: "string", bool: "boolean", int: "integer", type(None): "null"}
        assert kinds.get(type(value)) in allowed
    if isinstance(value, dict) and "properties" in spec:
        assert set(spec["required"]) <= value.keys()
        if spec.get("additionalProperties") is False:
            assert value.keys() <= spec["properties"].keys()
        for key in value:
            schema_shape(value[key], spec["properties"][key])
    if isinstance(value, list) and "items" in spec:
        assert len(value) >= spec.get("minItems", 0)
        assert len(value) <= spec.get("maxItems", len(value))
        if spec.get("uniqueItems"):
            assert len(value) == len(set(value))
        for child in value:
            schema_shape(child, spec["items"])
    if isinstance(value, str):
        assert len(value) >= spec.get("minLength", 0)
        if "pattern" in spec:
            assert re.fullmatch(spec["pattern"], value)
    if type(value) is int:
        assert value >= spec.get("minimum", value)
        assert value <= spec.get("maximum", value)
    if "allOf" in spec:
        # This fixture schema's only conditional is read=text => attribute=null.
        assert (value["attribute"] is None) if value["read"] == "text" else (isinstance(value["attribute"], str) and bool(value["attribute"]))


class Rows(HTMLParser):
    """Inspect the explicit fixture markup, not a CSS engine or product extractor."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.current = None
        self.field = None
        self.has_title = False
        self.base_uri = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.has_title |= tag == "title" or "title" in attrs
        if tag == "base":
            self.base_uri = attrs.get("href")
        if tag == "article":
            self.current = {"missing": None}
            self.rows.append(self.current)
        elif self.current is not None and tag in ("a", "span"):
            self.field = attrs["class"]
            self.current[self.field] = ""
            if tag == "a":
                self.current["name-url"] = attrs.get("href")

    def handle_endtag(self, tag):
        if tag in ("a", "span"):
            self.field = None
        if tag == "article":
            self.current = None

    def handle_data(self, data):
        if self.field:
            self.current[self.field] += data


def safe_csv_string(value):
    protect = value.startswith(("\t", "\r")) or value.lstrip(ECMASCRIPT_WHITESPACE).startswith(("=", "+", "-", "@"))
    return "'" + value if protect else value


def expected_csv(records, template):
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    labels = {field["id"]: field["label"] for field in template["fields"]}
    types = {field["id"]: field["type"] for field in template["fields"]}
    writer.writerow([safe_csv_string(labels[key]) for key in template["columns"]])
    for record in records:
        cells = []
        for key in template["columns"]:
            value = record[key]
            cell = "" if value is None else (str(value).lower() if type(value) is bool else str(value))
            if types[key] == "string" and isinstance(value, str):
                cell = safe_csv_string(cell)
            cells.append(cell)
        writer.writerow(cells)
    return output.getvalue().encode("utf-8")


def main():
    manifest = load("manifest.json")
    assert manifest["status"] == "planned" and manifest["productResult"] == "not-run"
    schema = load(manifest["templateSchema"])
    vectors = [load(path) for path in manifest["cases"]]
    for vector in vectors:
        assert vector["status"] == "planned" and vector["productResult"] == "not-run"
        walk_blobs(vector)
        original = check_blob(vector["input"]["legacyBackup"])
        assert b"\r\n" in original
        assert json.loads(original) == vector["input"]["legacyParsed"]
        assert vector["expected"]["backupPreserved"] is True
    single = vectors[0]
    expected = single["expected"]
    template = expected["templateRevision"]
    schema_shape(template, schema)
    assert template == load("single-page/expected-template.json")
    without_hash = {key: value for key, value in template.items() if key != "contentHash"}
    assert canonical(without_hash) == check_blob(expected["canonicalTemplate"])
    assert hashlib.sha256(canonical(without_hash)).hexdigest() == template["contentHash"]
    assert template["contentHash"] == "3475cba7ddc43506711b82a1865ae0228c056f074b45b364706322c057d681fa"
    assert set(template["columns"]) == {field["id"] for field in template["fields"]}
    assert template["columns"] != [field["id"] for field in template["fields"]]
    assert template["allowedOrigin"] == "https://fixture.example"
    assert single["input"]["context"]["fieldDefinitions"] == template["fields"]
    parser = Rows()
    parser.feed(single["input"]["dom"]["text"])
    assert not parser.has_title and parser.rows == expected["rawRecords"]
    assert len(parser.rows) == expected["recordCount"] == 3
    typed = expected["typedRecords"]
    assert typed == expected["previewRecords"] == expected["runRecords"]
    for row in typed:
        assert list(row) == template["columns"]
        assert row["empty"] == "" and row["missing"] is None
        assert type(row["enabled"]) is bool
    assert type(typed[0]["count"]) is int and typed[0]["count"] == 0
    assert typed[0]["enabled"] is False and typed[1]["count"] == 12.5
    assert len(typed[0]["name"]) == 150 and len(typed[0]["name"].encode()) == 450
    assert check_blob(expected["exports"]["json"]) == json.dumps(typed, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    assert check_blob(expected["exports"]["csv"]) == expected_csv(typed, template)
    for vector in vectors[1:]:
        blocked = vector["expected"]
        assert blocked["templateRevision"] is None and blocked["draft"]["contentHash"] is None
        assert blocked["errors"] and not any(blocked["operations"].values())
        assert blocked["columns"] == blocked["rawRecords"] == blocked["typedRecords"] == []
        for export in blocked["exports"].values():
            assert export["allowed"] is False and export["artifact"] is None
            assert check_blob(export["emittedBytes"]) == b""
    strict = load("strict-conversion/vectors.json")
    walk_blobs(strict)
    for vector in strict["cases"]:
        assert vector["status"] == "planned" and vector["productResult"] == "not-run"
        token = vector["expected"]["rawRecords"][0]["value"]
        parser = Rows()
        parser.feed(vector["input"]["dom"]["text"])
        assert len(parser.rows) == 1 and parser.rows[0]["value"] == token
        kind = vector["input"]["field"]["type"]
        valid = token in ("true", "false") if kind == "boolean" else bool(re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", token))
        if kind == "number" and valid:
            number = json.loads(token)
            valid = math.isfinite(number) and (not float(number).is_integer() or abs(number) <= 9007199254740991)
        assert valid == vector["expected"]["pageSealable"]
        if valid:
            value = token == "true" if kind == "boolean" else json.loads(token)
            assert vector["expected"]["typedRecords"] == [{"value": value}]
        else:
            assert vector["expected"]["typedRecords"] == [] and len(vector["expected"]["errors"]) == 1
    urls = load("strict-url/vectors.json")
    walk_blobs(urls)
    for vector in urls["cases"]:
        assert vector["status"] == "planned" and vector["productResult"] == "not-run"
        parser = Rows()
        parser.feed(vector["input"]["dom"]["text"])
        assert len(parser.rows) == 1
        assert parser.rows[0]["name-url"] == vector["expected"]["rawRecords"][0]["value"]
        assert parser.base_uri == vector["input"]["context"]["documentBaseURI"]
        assert vector["expected"]["networkActionsExpected"] == 0
    csv_vectors = load("csv-formula-safety/vectors.json")
    walk_blobs(csv_vectors)
    for vector in csv_vectors["cases"]:
        assert vector["status"] == "planned" and vector["productResult"] == "not-run"
        data, expected = vector["input"], vector["expected"]
        assert data["rawRecords"] == data["typedRecords"] == expected["rawRecords"] == expected["typedRecords"]
        assert check_blob(expected["json"]) == json.dumps(data["typedRecords"], ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        assert check_blob(expected["csv"]) == expected_csv(data["typedRecords"], data)
        csv_rows = list(csv.reader(io.StringIO(expected["csv"]["text"], newline="")))
        assert csv_rows[1] == expected["cells"]
        value = data["typedRecords"][0]["value"]
        protected = data["fields"][0]["type"] == "string" and isinstance(value, str) and safe_csv_string(value) != value
        assert protected == expected["protectionApplied"]
    rejections = load("template-rejection-vectors.json")
    for vector in rejections["cases"]:
        candidate = json.loads(json.dumps(template))
        mutation = vector["input"]["mutation"]
        parts = mutation["path"].split("/")[1:]
        target = candidate
        for part in parts[:-1]:
            target = target[int(part)] if isinstance(target, list) else target[part]
        target[parts[-1]] = mutation["value"]
        try:
            restricted(candidate)
            schema_shape(candidate, schema)
        except AssertionError:
            continue
        raise AssertionError("Rejection vector did not reject: " + vector["id"])
    for source in manifest["sources"]:
        path = Path(source["path"])
        if not path.is_absolute():
            path = REPO / path
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"]
    reference = subprocess.run(["node", str(ROOT / "reference-check.cjs")], check=True, capture_output=True, text=True)
    reference_result = json.loads(reference.stdout)
    assert reference_result["status"] == "planned" and reference_result["productResult"] == "not-run"
    print(json.dumps({"fixtureIntegrity": "verified", "migrationVectors": len(vectors), "strictConversionVectors": len(strict["cases"]), "strictUrlVectors": len(urls["cases"]), "csvFormulaSafetyVectors": len(csv_vectors["cases"]), "templateRejectionVectors": len(rejections["cases"]), "nodeReference": reference_result, "status": "planned", "productResult": "not-run", "productConverterExecuted": False, "chromeAcceptanceExecuted": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
