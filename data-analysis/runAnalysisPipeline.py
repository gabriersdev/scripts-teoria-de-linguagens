"""Orchestrates all 4 language analysis scripts, exports incidence:words, rebuilds datasets,
and persists consolidated execution metrics snapshots."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
ANALYSIS_DIR: Path = PROJECT_ROOT / "analysis"
DATA_ANALYSIS_DIR: Path = PROJECT_ROOT / "data-analysis"
DATASETS_DIR: Path = DATA_ANALYSIS_DIR / "datasets"
INCIDENCE_JSON_PATH: Path = DATASETS_DIR / "incidenceWordsReport.json"
SNAPSHOT_PATH: Path = DATASETS_DIR / "pipelineMetricsSnapshot.json"
HISTORY_PATH: Path = DATASETS_DIR / "pipelineRunsHistory.json"
TSX_CLI_PATH: Path = PROJECT_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"

LANGUAGE_RUNS: tuple[tuple[str, str, list[str]], ...] = (
    (
        "Julia",
        "julia",
        ["julia", str(ANALYSIS_DIR / "julia" / "maskSwearWords.jl"), "--export-analysis"],
    ),
    (
        "TypeScript",
        "typescript",
        ["node", str(TSX_CLI_PATH), str(ANALYSIS_DIR / "typescript" / "mask-swear-words.ts")],
    ),
    (
        "Java",
        "java",
        ["java", str(ANALYSIS_DIR / "java" / "SwearWordMasker.java")],
    ),
    (
        "C#",
        "csharp",
        ["dotnet", "run", "-c", "Release", "--project", str(ANALYSIS_DIR / "csharp")],
    ),
)


def run_step(label: str, command: list[str]) -> str:
    """Executes a subprocess step sequentially, printing output and raising on failure."""
    print(f"\n# [{label}] Running: {' '.join(command)}")
    completed = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.stderr.strip():
        print(completed.stderr.strip(), file=sys.stderr)

    if completed.returncode != 0:
        raise RuntimeError(f"Step '{label}' failed with exit code {completed.returncode}.")

    return completed.stdout


def export_incidence_words_report() -> None:
    """Runs scripts/incidence-words.ts in JSON mode and saves clean UTF-8 output."""
    command = [
        "node",
        str(TSX_CLI_PATH),
        str(PROJECT_ROOT / "scripts" / "incidence-words.ts"),
        "--json",
        "--limit=200",
        "--genre-top=100",
    ]
    print(f"\n# [incidence:words] Exporting JSON report")
    completed = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if completed.returncode != 0:
        if completed.stderr.strip():
            print(completed.stderr.strip(), file=sys.stderr)
        raise RuntimeError(f"incidence:words failed with exit code {completed.returncode}.")

    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    INCIDENCE_JSON_PATH.write_text(completed.stdout, encoding="utf-8")
    print(f"Saved {INCIDENCE_JSON_PATH} ({INCIDENCE_JSON_PATH.stat().st_size:,} bytes)")


def collect_language_metrics() -> list[dict[str, Any]]:
    """Reads each language's summary.json produced during the current run."""
    metrics: list[dict[str, Any]] = []
    for language_label, folder_name, _ in LANGUAGE_RUNS:
        summary_path = ANALYSIS_DIR / folder_name / "output" / "summary.json"
        if not summary_path.is_file():
            raise FileNotFoundError(f"Missing summary.json for {language_label}: {summary_path}")

        with summary_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        metrics.append(data)
    return metrics


def validate_parity(metrics: list[dict[str, Any]]) -> dict[str, Any]:
    """Verifies all 4 languages processed the exact same corpus and found identical matches."""
    checked_keys = (
        "swearWordsLoaded",
        "filesProcessed",
        "filesWithMatches",
        "totalMatches",
        "totalCharacters",
        "totalBytes",
    )
    baseline = metrics[0]
    mismatches: list[str] = []

    for item in metrics[1:]:
        for key in checked_keys:
            if item.get(key) != baseline.get(key):
                mismatches.append(
                    f"{item.get('language')}.{key}={item.get(key)} != "
                    f"{baseline.get('language')}.{key}={baseline.get(key)}"
                )

    return {
        "isConsistent": len(mismatches) == 0,
        "mismatches": mismatches,
        "swearWordsLoaded": baseline.get("swearWordsLoaded"),
        "filesProcessed": baseline.get("filesProcessed"),
        "filesWithMatches": baseline.get("filesWithMatches"),
        "totalMatches": baseline.get("totalMatches"),
        "totalCharacters": baseline.get("totalCharacters"),
        "totalBytes": baseline.get("totalBytes"),
    }


def persist_metrics_snapshot(
    metrics: list[dict[str, Any]],
    parity: dict[str, Any],
) -> dict[str, Any]:
    """Saves the latest pipeline metrics snapshot and appends it to pipelineRunsHistory.json."""
    snapshot: dict[str, Any] = {
        "executedAtUtc": datetime.now(timezone.utc).isoformat(),
        "parity": parity,
        "languages": metrics,
    }

    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(
        f"{json.dumps(snapshot, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )

    history: list[dict[str, Any]] = []
    if HISTORY_PATH.is_file():
        try:
            loaded = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, list):
                history = loaded
        except json.JSONDecodeError:
            history = []

    history.append(snapshot)
    HISTORY_PATH.write_text(
        f"{json.dumps(history, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )
    return snapshot


def print_consolidated_table(metrics: list[dict[str, Any]], parity: dict[str, Any]) -> None:
    """Prints a compact summary table of all 4 engines and parity status."""
    print("\n# Consolidated Pipeline Metrics")
    print(
        f"Parity: {'OK' if parity['isConsistent'] else 'MISMATCH'} | "
        f"Swear words: {parity['swearWordsLoaded']} | "
        f"Files: {parity['filesProcessed']} | "
        f"With matches: {parity['filesWithMatches']} | "
        f"Total matches: {parity['totalMatches']} | "
        f"Chars: {parity['totalCharacters']}"
    )
    print(
        f"{'Language':<12} {'Elapsed(ms)':>12} {'Match(ms)':>10} "
        f"{'ns/char':>9} {'chars/ms':>11} {'MB/s':>8} {'r':>8} {'R^2':>8}"
    )
    print("-" * 84)
    for item in sorted(metrics, key=lambda entry: entry.get("matchingTimeMs", 0.0)):
        print(
            f"{item['language']:<12} "
            f"{item['elapsedMs']:>12.2f} "
            f"{item['matchingTimeMs']:>10.2f} "
            f"{item['nsPerChar']:>9.2f} "
            f"{item['charsPerMs']:>11.2f} "
            f"{item['throughputMBs']:>8.2f} "
            f"{item['pearsonCorrelationR']:>8.4f} "
            f"{item['rSquared']:>8.4f}"
        )
    print(f"\nSnapshot saved : {SNAPSHOT_PATH}")
    print(f"History updated: {HISTORY_PATH}")


def main() -> int:
    """Runs the complete analysis, registration, and dataset consolidation pipeline."""
    try:
        for language_label, _, command in LANGUAGE_RUNS:
            run_step(language_label, command)

        metrics = collect_language_metrics()
        parity = validate_parity(metrics)

        export_incidence_words_report()
        run_step(
            "buildDatasets",
            [sys.executable, str(DATA_ANALYSIS_DIR / "buildDatasets.py")],
        )

        persist_metrics_snapshot(metrics, parity)
        print_consolidated_table(metrics, parity)

        if not parity["isConsistent"]:
            print(f"[WARNING] Parity mismatches detected: {parity['mismatches']}", file=sys.stderr)
            return 2

        return 0
    except (RuntimeError, FileNotFoundError, OSError) as error:
        print(f"[runAnalysisPipeline] Pipeline failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
