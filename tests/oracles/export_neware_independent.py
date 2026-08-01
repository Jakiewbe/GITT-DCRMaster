#!/usr/bin/env python3
"""Create deterministic, independent NDAX evidence exports.

This utility is deliberately outside the production TypeScript parser.  It
uses two Python-side paths:

1. NewareNDA for a conventional tabular interpretation; and
2. an explicit ``zipfile``/``struct`` decoder for the integer timing and raw
   float32 fields used by the parity comparison.

The resulting CSV files are evidence for ``independent_export_parity`` only.
They are not vendor-official exports and do not approve the production parser.
Large CSV files belong on the D: test drive, not in the repository.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import struct
import sys
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import NewareNDA
from NewareNDA.dicts import state_dict


EXPORTER_ID = "neware-independent-export-parity"
EXPORTER_VERSION = "1.0.0"
BLOCK_SIZE = 4096
BLOCK_PAYLOAD_OFFSET = 132


@dataclass(frozen=True)
class DataPoint:
    index: int
    voltage_v: float
    current_a: float
    voltage_bits: str
    current_bits: str


@dataclass(frozen=True)
class RunPoint:
    index: int
    raw_step: int
    step_ordinal: int
    step_time_ms: int
    timestamp_ms: int
    charge_capacity_ah: float
    discharge_capacity_ah: float
    charge_capacity_bits: str
    discharge_capacity_bits: str


@dataclass(frozen=True)
class StepPoint:
    step_ordinal: int
    cycle: int
    step_index: int
    status: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def float32_bits(value_bytes: bytes) -> str:
    return value_bytes.hex()


def iter_block_records(data: bytes, record_length: int, trailing_bytes: int) -> Iterable[bytes]:
    for block_start in range(BLOCK_SIZE, len(data), BLOCK_SIZE):
        block_end = min(block_start + BLOCK_SIZE, len(data))
        payload_end = block_end - trailing_bytes
        for offset in range(block_start + BLOCK_PAYLOAD_OFFSET, payload_end, record_length):
            record = data[offset : offset + record_length]
            if len(record) == record_length:
                yield record


def require_ndc_header(data: bytes, file_type: int) -> None:
    if len(data) < 3 or data[0] != file_type or data[2] != 17:
        actual_type = data[0] if data else None
        actual_version = data[2] if len(data) > 2 else None
        raise ValueError(
            f"unsupported_ndc_profile:expected_v17_type{file_type}:"
            f"actual_v{actual_version}_type{actual_type}"
        )


def decode_data(data: bytes) -> list[DataPoint]:
    require_ndc_header(data, 1)
    points: list[DataPoint] = []
    for record in iter_block_records(data, 8, 4):
        voltage_v, current_a = struct.unpack("<ff", record)
        if voltage_v == 0:
            continue
        points.append(
            DataPoint(
                index=len(points) + 1,
                voltage_v=voltage_v,
                current_a=current_a,
                voltage_bits=float32_bits(record[0:4]),
                current_bits=float32_bits(record[4:8]),
            )
        )
    return points


def decode_run_info(data: bytes) -> list[RunPoint]:
    require_ndc_header(data, 18)
    by_index: dict[int, tuple[int, int, int, float, float, str, str]] = {}
    for record in iter_block_records(data, 100, 64):
        step_time_ms = struct.unpack_from("<i", record, 0)[0]
        charge_capacity_ah = struct.unpack_from("<f", record, 5)[0]
        discharge_capacity_ah = struct.unpack_from("<f", record, 9)[0]
        timestamp_s = struct.unpack_from("<i", record, 33)[0]
        raw_step = struct.unpack_from("<i", record, 37)[0]
        index = struct.unpack_from("<i", record, 41)[0]
        timestamp_remainder_ms = struct.unpack_from("<h", record, 45)[0]
        if index == 0 or index in by_index:
            continue
        by_index[index] = (
            raw_step,
            step_time_ms,
            timestamp_s * 1000 + timestamp_remainder_ms,
            charge_capacity_ah,
            discharge_capacity_ah,
            float32_bits(record[5:9]),
            float32_bits(record[9:13]),
        )

    points: list[RunPoint] = []
    previous_raw_step: int | None = None
    step_ordinal = 0
    for index in sorted(by_index):
        (
            raw_step,
            step_time_ms,
            timestamp_ms,
            charge_capacity_ah,
            discharge_capacity_ah,
            charge_capacity_bits,
            discharge_capacity_bits,
        ) = by_index[index]
        if previous_raw_step is None or raw_step != previous_raw_step:
            step_ordinal += 1
        previous_raw_step = raw_step
        points.append(
            RunPoint(
                index=index,
                raw_step=raw_step,
                step_ordinal=step_ordinal,
                step_time_ms=step_time_ms,
                timestamp_ms=timestamp_ms,
                charge_capacity_ah=charge_capacity_ah,
                discharge_capacity_ah=discharge_capacity_ah,
                charge_capacity_bits=charge_capacity_bits,
                discharge_capacity_bits=discharge_capacity_bits,
            )
        )
    return points


def decode_steps(data: bytes) -> list[StepPoint]:
    require_ndc_header(data, 7)
    points: list[StepPoint] = []
    for record in iter_block_records(data, 100, 64):
        cycle_zero_based = struct.unpack_from("<i", record, 0)[0]
        step_index = struct.unpack_from("<i", record, 4)[0]
        status_code = record[24]
        index = struct.unpack_from("<i", record, 33)[0]
        if index == 0:
            continue
        try:
            status = state_dict[status_code]
        except KeyError as error:
            raise ValueError(f"unknown_neware_status:{status_code}") from error
        points.append(
            StepPoint(
                step_ordinal=len(points) + 1,
                cycle=cycle_zero_based + 1,
                step_index=step_index,
                status=status,
            )
        )
    return points


def exact_integer(value: object, field: str, row_index: int) -> int:
    integer = int(value)
    if float(value) != integer:
        raise AssertionError(f"newarenda_noninteger:{field}:row={row_index}:value={value}")
    return integer


def assert_close(actual: float, expected: float, tolerance: float, field: str, row_index: int) -> float:
    difference = abs(actual - expected)
    if not math.isfinite(difference) or difference > tolerance:
        raise AssertionError(
            f"newarenda_value_mismatch:{field}:row={row_index}:"
            f"actual={actual}:expected={expected}:difference={difference}:tolerance={tolerance}"
        )
    return difference


def validate_newarenda_table(file_path: Path, merged_rows: list[dict[str, object]]) -> dict[str, float | int]:
    frame = NewareNDA.read(
        str(file_path),
        software_cycle_number=False,
        log_level="ERROR",
    )
    if len(frame) != len(merged_rows):
        raise AssertionError(
            f"newarenda_row_count_mismatch:table={len(frame)}:struct={len(merged_rows)}"
        )

    maxima: dict[str, float | int] = {
        "stepTimeMs": 0,
        "timestampMs": 0,
        "voltageV": 0.0,
        "currentMa": 0.0,
        "chargeCapacityMah": 0.0,
        "dischargeCapacityMah": 0.0,
    }
    for position, (_, table_row) in enumerate(frame.iterrows()):
        expected = merged_rows[position]
        row_index = int(expected["record_index"])
        exact_fields = {
            "Index": "record_index",
            "Cycle": "cycle",
            "Step": "step_ordinal",
            "Step_Index": "step_index",
        }
        for table_field, expected_field in exact_fields.items():
            if exact_integer(table_row[table_field], table_field, row_index) != expected[expected_field]:
                raise AssertionError(
                    f"newarenda_identity_mismatch:{table_field}:row={row_index}:"
                    f"table={table_row[table_field]}:struct={expected[expected_field]}"
                )
        if str(table_row["Status"]) != expected["status"]:
            raise AssertionError(
                f"newarenda_status_mismatch:row={row_index}:"
                f"table={table_row['Status']}:struct={expected['status']}"
            )

        table_step_time_ms = round(float(table_row["Time"]) * 1000)
        maxima["stepTimeMs"] = max(
            int(maxima["stepTimeMs"]),
            abs(table_step_time_ms - int(expected["step_time_ms"])),
        )
        table_timestamp_ms = int(table_row["Timestamp"].value // 1_000_000)
        maxima["timestampMs"] = max(
            int(maxima["timestampMs"]),
            abs(table_timestamp_ms - int(expected["timestamp_ms"])),
        )
        maxima["voltageV"] = max(
            float(maxima["voltageV"]),
            assert_close(float(table_row["Voltage"]), float(expected["voltage_v"]), 0.0, "Voltage", row_index),
        )
        maxima["currentMa"] = max(
            float(maxima["currentMa"]),
            assert_close(
                float(table_row["Current(mA)"]),
                float(expected["current_a"]) * 1000,
                5e-7,
                "Current(mA)",
                row_index,
            ),
        )
        maxima["chargeCapacityMah"] = max(
            float(maxima["chargeCapacityMah"]),
            assert_close(
                float(table_row["Charge_Capacity(mAh)"]),
                float(expected["charge_capacity_ah"]) * 1000,
                5e-7,
                "Charge_Capacity(mAh)",
                row_index,
            ),
        )
        maxima["dischargeCapacityMah"] = max(
            float(maxima["dischargeCapacityMah"]),
            assert_close(
                float(table_row["Discharge_Capacity(mAh)"]),
                float(expected["discharge_capacity_ah"]) * 1000,
                5e-7,
                "Discharge_Capacity(mAh)",
                row_index,
            ),
        )
    return maxima


def merge_independent_records(file_path: Path) -> tuple[list[dict[str, object]], dict[str, float | int]]:
    with zipfile.ZipFile(file_path) as archive:
        data_points = decode_data(archive.read("data.ndc"))
        run_points = decode_run_info(archive.read("data_runInfo.ndc"))
        step_points = decode_steps(archive.read("data_step.ndc"))

    run_by_index = {point.index: point for point in run_points}
    step_by_ordinal = {point.step_ordinal: point for point in step_points}
    merged_rows: list[dict[str, object]] = []
    for data_point in data_points:
        run_point = run_by_index.get(data_point.index)
        if run_point is None:
            raise AssertionError(f"independent_runinfo_missing:index={data_point.index}")
        step_point = step_by_ordinal.get(run_point.step_ordinal)
        if step_point is None:
            raise AssertionError(
                f"independent_step_missing:step_ordinal={run_point.step_ordinal}:index={data_point.index}"
            )
        merged_rows.append(
            {
                "record_index": data_point.index,
                "cycle": step_point.cycle,
                "step_ordinal": run_point.step_ordinal,
                "step_index": step_point.step_index,
                "status": step_point.status,
                "step_time_ms": run_point.step_time_ms,
                "timestamp_ms": run_point.timestamp_ms,
                "voltage_v": data_point.voltage_v,
                "current_a": data_point.current_a,
                "charge_capacity_ah": run_point.charge_capacity_ah,
                "discharge_capacity_ah": run_point.discharge_capacity_ah,
                "voltage_float32_le_hex": data_point.voltage_bits,
                "current_float32_le_hex": data_point.current_bits,
                "charge_capacity_float32_le_hex": run_point.charge_capacity_bits,
                "discharge_capacity_float32_le_hex": run_point.discharge_capacity_bits,
            }
        )

    if len(merged_rows) != len(data_points):
        raise AssertionError(
            f"independent_merge_incomplete:merged={len(merged_rows)}:data={len(data_points)}"
        )
    library_maxima = validate_newarenda_table(file_path, merged_rows)
    return merged_rows, library_maxima


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        raise ValueError("cannot_export_empty_ndax")
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def normalized_name(name: str) -> str:
    return unicodedata.normalize("NFC", name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--expected-count", type=int, default=13)
    args = parser.parse_args()

    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    files = sorted(input_dir.glob("*.ndax"), key=lambda path: normalized_name(path.name))
    if len(files) != args.expected_count:
        raise SystemExit(
            f"unexpected_ndax_count:expected={args.expected_count}:actual={len(files)}:dir={input_dir}"
        )
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_files: list[dict[str, object]] = []
    for position, file_path in enumerate(files, start=1):
        rows, library_maxima = merge_independent_records(file_path)
        evidence_name = f"{file_path.stem}.independent.csv"
        evidence_path = output_dir / evidence_name
        write_csv(evidence_path, rows)
        entry = {
            "sourceFileName": normalized_name(file_path.name),
            "sourceFileSha256": sha256_file(file_path),
            "evidenceCsvName": normalized_name(evidence_name),
            "evidenceCsvSha256": sha256_file(evidence_path),
            "rowCount": len(rows),
            "newareNdaTableCrossCheckMaxDifferences": library_maxima,
        }
        manifest_files.append(entry)
        print(
            f"[{position:02d}/{len(files):02d}] {file_path.name}: "
            f"rows={len(rows)} csv_sha256={entry['evidenceCsvSha256']}"
        )

    manifest = {
        "evidenceKind": "independent_export_parity",
        "officialExport": False,
        "exporterId": EXPORTER_ID,
        "exporterVersion": EXPORTER_VERSION,
        "newareNdaVersion": NewareNDA.__version__,
        "files": manifest_files,
    }
    manifest_path = output_dir / "independent-export-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"manifest={manifest_path}")
    print(f"manifest_sha256={sha256_file(manifest_path)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
