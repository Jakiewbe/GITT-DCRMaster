"""Independent scientific Oracle pack for GITT-DCRMaster.

This module is deliberately dependency-free and does not import any production
TypeScript module.  It reads fixed raw inputs from ``oracle_pack_v1.json`` and
recomputes the expected values through a separate implementation path.

The script never updates the golden file.  Use ``--emit`` to inspect independently
computed values, then review and commit golden changes explicitly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import unicodedata
from typing import Any


PACK_PATH = Path(__file__).with_name("oracle_pack_v1.json")


def _canonical_string(value: str) -> str:
    return json.dumps(
        unicodedata.normalize("NFC", value),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )


def _canonical_number(value: int | float) -> str:
    if isinstance(value, bool):
        raise TypeError("booleans are not canonical numbers")
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        raise ValueError("canonical JSON forbids NaN and Infinity")
    if value == 0:
        return "0"
    if value.is_integer():
        return str(int(value))
    # Oracle vectors avoid exponent-boundary values where Python and ECMAScript
    # spell the same IEEE-754 number differently.
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def canonicalize(value: Any) -> str:
    """Small independent RFC-8785-compatible encoder for the approved vectors."""

    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _canonical_number(value)
    if isinstance(value, str):
        return _canonical_string(value)
    if isinstance(value, list):
        return "[" + ",".join(canonicalize(item) for item in value) + "]"
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            normalized_key = unicodedata.normalize("NFC", key)
            if normalized_key in normalized:
                raise ValueError(f"keys collide after NFC normalization: {normalized_key}")
            normalized[normalized_key] = item
        return "{" + ",".join(
            f"{_canonical_string(key)}:{canonicalize(normalized[key])}"
            for key in sorted(normalized)
        ) + "}"
    raise TypeError(f"unsupported canonical value: {type(value)!r}")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_canonical(value: Any) -> str:
    return sha256_text(canonicalize(value))


def compute_row_id(source: dict[str, Any]) -> str:
    identity = canonicalize(
        {
            "sourceRecordSequence": source["sourceRecordSequence"],
            "sourceRowIndex": source["sourceRowIndex"],
            "sourceSheet": source["sourceSheet"],
        }
    )
    material = "source-row-v1\0{}\0{}\0{}\0{}".format(
        source["sourceFileHash"],
        source["channelId"] or "",
        source["sourceStream"],
        identity,
    )
    return sha256_text(material)


def compute_hash_oracle(section: dict[str, Any]) -> dict[str, Any]:
    jcs_input = {
        "a": [3, None, section["jcs"]["decomposedText"]],
        "b": -0.0,
        "big": section["jcs"]["bigintDecimal"],
        "nested": {"伪": True},
    }
    canonical = canonicalize(jcs_input)

    row_ids = [compute_row_id(source) for source in section["sourceRows"]]
    canonical_rows: list[dict[str, Any]] = []
    for row in section["canonicalRows"]:
        scientific = dict(row["scientific"])
        scientific["rowId"] = row_ids[row["sourceIndex"]]
        canonical_rows.append(scientific)

    canonical_rows.sort(
        key=lambda row: (
            int(row["elapsedTimeTicks"]) * int(row["timeResolutionNs"]),
            int(row["recordSequence"]),
            row["rowId"],
        )
    )
    dataset_payload = {"schema": "canonical-dataset-v1", "rows": canonical_rows}
    return {
        "canonical": canonical,
        "sha256": sha256_text(canonical),
        "rowIds": row_ids,
        "canonicalDatasetHash": hash_canonical(dataset_payload),
    }


def ordinary_least_squares(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    if len(points) < 2:
        raise ValueError("at least two regression points are required")
    x_values = [point[0] for point in points]
    y_values = [point[1] for point in points]
    mean_x = math.fsum(x_values) / len(x_values)
    mean_y = math.fsum(y_values) / len(y_values)
    sxx = math.fsum((value - mean_x) ** 2 for value in x_values)
    sxy = math.fsum((x - mean_x) * (y - mean_y) for x, y in points)
    if sxx == 0:
        raise ValueError("regression x values have zero variance")
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    residuals = [y - (intercept + slope * x) for x, y in points]
    sse = math.fsum(value * value for value in residuals)
    sst = math.fsum((value - mean_y) ** 2 for value in y_values)
    r_squared = 1.0 if sst == 0 and sse == 0 else 1.0 - sse / sst
    return slope, intercept, r_squared


def compute_gitt_oracle(section: dict[str, Any]) -> dict[str, Any]:
    start_s, end_s = section["fitWindowS"]
    fit_rows = [
        row for row in section["pulsePoints"]
        if start_s <= row["timeS"] <= end_s
    ]
    regression_points = [
        (math.sqrt(row["timeS"]), row["voltageV"])
        for row in fit_rows
    ]
    slope, intercept, r_squared = ordinary_least_squares(regression_points)

    length_cm = section["activeMaterialEquivalentThicknessCm"]
    pulse_duration_s = section["pulseDurationS"]
    delta_es_v = section["deltaEsV"]
    pulse_start = next(
        row["voltageV"] for row in section["pulsePoints"]
        if row["timeS"] == 0
    )
    pulse_end = next(
        row["voltageV"] for row in section["pulsePoints"]
        if row["timeS"] == pulse_duration_s
    )
    observed = pulse_end - pulse_start
    metric = (4.0 / (math.pi * pulse_duration_s)) * length_cm**2 * (
        delta_es_v / observed
    ) ** 2
    predicted = slope * math.sqrt(pulse_duration_s)
    denominator = max(
        abs(observed),
        abs(predicted),
        5 * section["voltageNoiseFloorV"],
    )
    endpoint_error = abs(observed - predicted) / denominator
    return {
        "fitPointCount": len(fit_rows),
        "slopeVPerSqrtS": slope,
        "interceptV": intercept,
        "rSquared": r_squared,
        "metricValueCm2PerS": metric,
        "predictedDeltaEAtTauV": predicted,
        "observedDeltaEAtTauV": observed,
        "endpointConsistencyRelativeError": endpoint_error,
        "dimensionlessPulseTime": metric * pulse_duration_s / length_cm**2,
        "dimensionlessFitTime": metric * end_s / length_cm**2,
    }


def compute_dcr_oracle(section: dict[str, Any]) -> dict[str, Any]:
    baseline_voltage = section["baseline"]["voltageV"]
    baseline_current = section["baseline"]["currentA"]
    points_by_offset = {
        int(point["offsetNs"]): point
        for point in section["pulsePoints"]
    }
    first_offset = min(points_by_offset)
    values: dict[str, Any] = {}
    for request in section["requests"]:
        offset = first_offset if request["kind"] == "first_sample" else int(request["offsetNs"])
        point = points_by_offset.get(offset)
        if point is None:
            values[request["label"]] = {
                "calculationState": "not_computable",
                "resistanceOhm": None,
            }
            continue
        delta_voltage = point["voltageV"] - baseline_voltage
        delta_current = point["currentA"] - baseline_current
        resistance = None if delta_current == 0 else delta_voltage / delta_current
        values[request["label"]] = {
            "calculationState": "computed" if resistance is not None else "not_computable",
            "actualOffsetNs": str(offset),
            "deltaVoltageV": delta_voltage,
            "deltaCurrentA": delta_current,
            "resistanceOhm": resistance,
        }
    return values


def compute_soc_oracle(section: dict[str, Any]) -> dict[str, Any]:
    rows = sorted(
        section["rows"],
        key=lambda row: (int(row["elapsedNs"]), int(row["recordSequence"]), row["rowId"]),
    )
    increments: list[float] = []
    cumulative: list[float] = []
    net_capacity = 0.0
    throughput = 0.0
    skipped_boundaries = 0
    boundary_gaps = 0
    duplicate_ticks = 0

    for index, row in enumerate(rows):
        increment = 0.0
        if index > 0:
            previous = rows[index - 1]
            delta_ns = int(row["elapsedNs"]) - int(previous["elapsedNs"])
            same_domain = (
                row["analysisStepId"] == previous["analysisStepId"]
                and row["stepType"] == previous["stepType"]
            )
            if not same_domain:
                skipped_boundaries += 1
                if delta_ns > 0:
                    boundary_gaps += 1
            elif delta_ns == 0:
                duplicate_ticks += 1
            elif delta_ns > 0:
                duration_s = delta_ns / 1_000_000_000
                increment = (
                    (previous["currentA"] + row["currentA"]) / 2
                ) * duration_s / 3600
        net_capacity += increment
        throughput += abs(increment)
        increments.append(increment)
        cumulative.append(net_capacity)

    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        if row["stepType"] in ("charge", "discharge"):
            groups.setdefault((row["analysisStepId"], row["stepType"]), []).append(row)
    integrated_ns = 0
    expected_ns = 0
    for group in groups.values():
        group.sort(key=lambda row: (int(row["elapsedNs"]), int(row["recordSequence"]), row["rowId"]))
        for index in range(1, len(group)):
            delta_ns = int(group[index]["elapsedNs"]) - int(group[index - 1]["elapsedNs"])
            if delta_ns > 0:
                integrated_ns += delta_ns
        expected_ns += max(int(row["stepElapsedNs"]) for row in group)
    coverage = 1.0 if expected_ns == 0 else min(1.0, integrated_ns / expected_ns)

    initial_soc = section["socBasis"]["initialSocPct"]
    qref_ah = section["socBasis"]["qrefAh"]
    soc = [initial_soc + value / qref_ah * 100 for value in cumulative]
    return {
        "incrementsAh": increments,
        "cumulativeNetCapacityAh": cumulative,
        "totalNetCapacityAh": net_capacity if boundary_gaps == 0 and coverage >= 0.99 else None,
        "diagnosticCandidateNetCapacityAh": net_capacity,
        "totalThroughputAh": throughput,
        "skippedBoundaryCount": skipped_boundaries,
        "boundaryGapCount": boundary_gaps,
        "duplicateTickCount": duplicate_ticks,
        "integratedDurationS": integrated_ns / 1_000_000_000,
        "expectedActivityDurationS": expected_ns / 1_000_000_000,
        "activityTimeCoverageFraction": coverage,
        "socPct": soc,
        "dodPct": [100 - value for value in soc],
    }


def compute_all(pack: dict[str, Any]) -> dict[str, Any]:
    return {
        "oraclePackVersion": pack["oraclePackVersion"],
        "hash": compute_hash_oracle(pack["inputs"]["hash"]),
        "gitt": compute_gitt_oracle(pack["inputs"]["gitt"]),
        "dcr": compute_dcr_oracle(pack["inputs"]["dcr"]),
        "soc": compute_soc_oracle(pack["inputs"]["soc"]),
    }


def assert_close(actual: Any, expected: Any, path: str = "expected") -> None:
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            raise AssertionError(f"{path}: expected object, got {type(actual).__name__}")
        if set(actual) != set(expected):
            raise AssertionError(
                f"{path}: key mismatch; actual={sorted(actual)}, expected={sorted(expected)}"
            )
        for key in expected:
            assert_close(actual[key], expected[key], f"{path}.{key}")
        return
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            raise AssertionError(f"{path}: list shape mismatch")
        for index, item in enumerate(expected):
            assert_close(actual[index], item, f"{path}[{index}]")
        return
    if isinstance(expected, float):
        if not isinstance(actual, (int, float)) or not math.isclose(
            float(actual), expected, rel_tol=1e-12, abs_tol=1e-16
        ):
            raise AssertionError(f"{path}: actual={actual!r}, expected={expected!r}")
        return
    if actual != expected:
        raise AssertionError(f"{path}: actual={actual!r}, expected={expected!r}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--emit", action="store_true", help="emit independently computed values")
    parser.add_argument("--verify", action="store_true", help="verify the committed golden values")
    args = parser.parse_args()
    pack = json.loads(PACK_PATH.read_text(encoding="utf-8"))
    computed = compute_all(pack)
    if args.verify or not args.emit:
        assert_close(computed, pack["expected"])
    print(json.dumps(computed, ensure_ascii=False, allow_nan=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        print(f"oracle verification failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
