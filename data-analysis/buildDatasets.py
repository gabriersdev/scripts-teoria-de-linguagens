"""Consolidates benchmark, linguistic, and metadata datasets into /data-analysis/datasets/."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
ANALYSIS_DIR: Path = PROJECT_ROOT / "analysis"
LYRICS_LIST_DIR: Path = PROJECT_ROOT / "lyrics-list"
LYRICS_DATA_DIR: Path = PROJECT_ROOT / "lyrics-data"
METADATA_DIR: Path = LYRICS_DATA_DIR / "metadata"
LYRICS_DIR: Path = LYRICS_DATA_DIR / "lyrics"
SWEAR_WORDS_PATH: Path = PROJECT_ROOT / "lib" / "swear-words.json"
JULIA_MATCHES_PATH: Path = ANALYSIS_DIR / "julia" / "output" / "matches-catalog.csv"
DATASETS_DIR: Path = PROJECT_ROOT / "data-analysis" / "datasets"
INCIDENCE_JSON_PATH: Path = DATASETS_DIR / "incidenceWordsReport.json"

LANGUAGE_FOLDERS: dict[str, str] = {
    "Julia": "julia",
    "TypeScript": "typescript",
    "Java": "java",
    "C#": "csharp",
}

COMMA_ARTIST_EXCEPTIONS: tuple[str, ...] = (
    "Ryu, the Runner",
    "Tyler, the Creator",
    "Earth, Wind & Fire",
    "Crosby, Stills & Nash",
)

YEAR_PATTERN: re.Pattern[str] = re.compile(r"(19\d{2}|20\d{2})")


def round_pct(numerator: int | float, denominator: int | float, digits: int = 2) -> float:
    """Computes percentage safely, returning 0.0 when denominator is zero."""
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, digits)


def write_csv(file_path: Path, headers: list[str], rows: list[list[Any]]) -> None:
    """Writes rows to a UTF-8 CSV file."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with file_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        writer.writerows(rows)


def extract_year_and_decade(release_date: str | None) -> tuple[str, str]:
    """Extracts 4-digit release year and decade label (e.g., '2020s') from a metadata date string."""
    if not release_date:
        return ("", "Desconhecida")

    match = YEAR_PATTERN.search(str(release_date))
    if not match:
        return ("", "Desconhecida")

    year = int(match.group(1))
    decade = f"{(year // 10) * 10}s"
    return (str(year), decade)


def split_artists(raw_artists: str) -> list[str]:
    """Splits comma-separated artist names while preserving known comma-containing artist names."""
    if not raw_artists or not raw_artists.strip():
        return ["Sem Artista"]

    masked = raw_artists
    tokens: dict[str, str] = {}
    for index, exception_name in enumerate(COMMA_ARTIST_EXCEPTIONS):
        placeholder = f"__ARTIST_EXCEPTION_{index}__"
        if exception_name.lower() in masked.lower():
            pattern = re.compile(re.escape(exception_name), re.IGNORECASE)
            masked = pattern.sub(placeholder, masked)
            tokens[placeholder] = exception_name

    artists: list[str] = []
    for part in masked.split(","):
        cleaned = part.strip()
        for placeholder, original_name in tokens.items():
            cleaned = cleaned.replace(placeholder, original_name)
        if cleaned:
            artists.append(cleaned)

    return artists if artists else ["Sem Artista"]


def load_track_catalog() -> dict[str, dict[str, Any]]:
    """Loads track index from /lyrics-list/*.json preserving separate genre names."""
    track_index: dict[str, dict[str, Any]] = {}
    list_files = sorted(LYRICS_LIST_DIR.glob("*.json"))

    for list_file in list_files:
        genre = list_file.name.replace("-list.json", "").replace(".json", "")
        with list_file.open("r", encoding="utf-8") as handle:
            groups = json.load(handle)

        for group in groups:
            for item in group.get("lyrics", []):
                track_id = item.get("id")
                if track_id is None:
                    continue
                key = str(track_id)
                track_index[key] = {
                    "track_id": key,
                    "title": item.get("name") or f"Faixa #{key}",
                    "artists": item.get("artists") or "Sem Artista",
                    "genre": genre,
                }

    return track_index


def load_track_metadata(track_id: str) -> dict[str, Any]:
    """Loads technical metadata for a single track from /lyrics-data/metadata/{id}.json."""
    meta_path = METADATA_DIR / f"{track_id}.json"
    if not meta_path.is_file():
        return {}

    try:
        with meta_path.open("r", encoding="utf-8") as handle:
            parsed = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}

    if isinstance(parsed, list) and parsed:
        return parsed[0].get("metadata", {}) or {}
    if isinstance(parsed, dict):
        return parsed.get("metadata", {}) or {}
    return {}


def load_swear_words_list() -> list[str]:
    """Loads the canonical swear-words list from /lib/swear-words.json."""
    with SWEAR_WORDS_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return list(data.get("swear-words", []))


def load_julia_matches() -> list[dict[str, str]]:
    """Loads per-occurrence regex matches exported by Julia."""
    if not JULIA_MATCHES_PATH.is_file():
        raise FileNotFoundError(
            f"Julia match catalog not found at {JULIA_MATCHES_PATH}. "
            "Run: julia analysis/julia/maskSwearWords.jl --export-analysis"
        )

    matches: list[dict[str, str]] = []
    with JULIA_MATCHES_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            matches.append(
                {
                    "track_id": row["track_id"],
                    "matched_text": row["matched_text"],
                    "canonical_term": row["canonical_term"],
                }
            )
    return matches


def build_benchmark_datasets() -> None:
    """Consolidates summary.json and linearity-metrics.csv across all 4 languages."""
    summary_rows: list[list[Any]] = []
    linearity_rows: list[list[Any]] = []

    for language_label, folder_name in LANGUAGE_FOLDERS.items():
        output_dir = ANALYSIS_DIR / folder_name / "output"
        summary_path = output_dir / "summary.json"
        linearity_path = output_dir / "linearity-metrics.csv"

        if summary_path.is_file():
            with summary_path.open("r", encoding="utf-8") as handle:
                summary = json.load(handle)
            summary_rows.append(
                [
                    summary.get("language", language_label),
                    summary.get("swearWordsLoaded", 0),
                    summary.get("filesProcessed", 0),
                    summary.get("filesWithMatches", 0),
                    summary.get("totalMatches", 0),
                    summary.get("totalCharacters", 0),
                    summary.get("totalBytes", 0),
                    summary.get("regexCompileMs", 0.0),
                    summary.get("matchingTimeMs", 0.0),
                    summary.get("matchingTimeNs", 0),
                    summary.get("elapsedMs", 0.0),
                    summary.get("nsPerChar", 0.0),
                    summary.get("charsPerMs", 0.0),
                    summary.get("throughputMBs", 0.0),
                    summary.get("pearsonCorrelationR", 0.0),
                    summary.get("rSquared", 0.0),
                ]
            )

        if linearity_path.is_file():
            with linearity_path.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    linearity_rows.append(
                        [
                            language_label,
                            row["file"],
                            row["characters"],
                            row["bytes"],
                            row["matches"],
                            row["matching_us"],
                            row["ns_per_char"],
                        ]
                    )

    write_csv(
        DATASETS_DIR / "benchmarkSummary.csv",
        [
            "language",
            "swear_words_loaded",
            "files_processed",
            "files_with_matches",
            "total_matches",
            "total_characters",
            "total_bytes",
            "regex_compile_ms",
            "matching_time_ms",
            "matching_time_ns",
            "elapsed_ms",
            "ns_per_char",
            "chars_per_ms",
            "throughput_mbs",
            "pearson_r",
            "r_squared",
        ],
        summary_rows,
    )

    write_csv(
        DATASETS_DIR / "benchmarkLinearity.csv",
        ["language", "file", "characters", "bytes", "matches", "matching_us", "ns_per_char"],
        linearity_rows,
    )


def build_incidence_words_datasets() -> dict[str, dict[str, Any]]:
    """Extracts flat CSV tables from incidence_words_report.json and returns per-genre lexical stats."""
    if not INCIDENCE_JSON_PATH.is_file():
        return {}

    with INCIDENCE_JSON_PATH.open("r", encoding="utf-8") as handle:
        report = json.load(handle)

    global_rows: list[list[Any]] = []
    for entry in report.get("topWords", []):
        global_rows.append(
            [
                entry["rank"],
                entry["word"],
                entry["occurrences"],
                entry["trackCount"],
                entry["trackCoveragePercent"].replace("%", ""),
                entry["sharePercent"].replace("%", ""),
                entry["isSwearWord"],
            ]
        )

    write_csv(
        DATASETS_DIR / "incidenceTopWordsGlobal.csv",
        [
            "rank",
            "word",
            "occurrences",
            "track_count",
            "diffusion_pct",
            "share_pct",
            "is_swear_word",
        ],
        global_rows,
    )

    genre_word_rows: list[list[Any]] = []
    genre_lexical_stats: dict[str, dict[str, Any]] = {}

    for genre_entry in report.get("genreSummaries", []):
        genre = genre_entry["genre"]
        genre_lexical_stats[genre] = {
            "raw_tokens": genre_entry.get("rawTokenCount", 0),
            "filtered_tokens": genre_entry.get("filteredTokenCount", 0),
            "unique_words": genre_entry.get("uniqueWordCount", 0),
        }

        for word_entry in genre_entry.get("topWords", []):
            genre_word_rows.append(
                [
                    genre,
                    word_entry["rank"],
                    word_entry["word"],
                    word_entry["occurrences"],
                    word_entry["trackCount"],
                    word_entry["trackCoveragePercent"].replace("%", ""),
                    word_entry["sharePercent"].replace("%", ""),
                    word_entry["isSwearWord"],
                ]
            )

    write_csv(
        DATASETS_DIR / "incidenceTopWordsByGenre.csv",
        [
            "genre",
            "rank",
            "word",
            "occurrences",
            "track_count",
            "diffusion_pct",
            "share_pct",
            "is_swear_word",
        ],
        genre_word_rows,
    )

    return genre_lexical_stats


def build_linguistic_datasets(genre_lexical_stats: dict[str, dict[str, Any]]) -> None:
    """Builds track, match, term, genre, decade, and artist datasets."""
    track_catalog = load_track_catalog()
    swear_words_catalog = load_swear_words_list()
    raw_matches = load_julia_matches()

    matches_by_track: dict[str, list[dict[str, str]]] = defaultdict(list)
    for item in raw_matches:
        matches_by_track[item["track_id"]].append(item)

    lyric_files = sorted(LYRICS_DIR.glob("*.txt"))
    tracks: list[dict[str, Any]] = []
    track_lookup: dict[str, dict[str, Any]] = {}

    for lyric_file in lyric_files:
        track_id = lyric_file.stem
        raw_bytes = lyric_file.read_bytes()
        content = raw_bytes.decode("utf-8")
        char_count = len(content)
        byte_count = len(raw_bytes)

        catalog_info = track_catalog.get(
            track_id,
            {
                "track_id": track_id,
                "title": f"Faixa #{track_id}",
                "artists": "Desconhecido",
                "genre": "desconhecido",
            },
        )
        metadata = load_track_metadata(track_id)
        release_date = metadata.get("releaseDate") or ""
        release_year, decade = extract_year_and_decade(release_date)

        track_matches = matches_by_track.get(track_id, [])
        swear_count = len(track_matches)
        unique_terms = len({m["canonical_term"] for m in track_matches})
        artists_list = split_artists(catalog_info["artists"])
        density = round((swear_count / char_count) * 1000.0, 4) if char_count > 0 else 0.0

        record = {
            "track_id": track_id,
            "title": catalog_info["title"],
            "artists": catalog_info["artists"],
            "artists_list": artists_list,
            "primary_artist": artists_list[0],
            "genre": catalog_info["genre"],
            "release_date": release_date,
            "release_year": release_year,
            "decade": decade,
            "characters": char_count,
            "bytes": byte_count,
            "swear_count": swear_count,
            "has_swear": swear_count > 0,
            "unique_swear_terms": unique_terms,
            "swear_density_per_1k_chars": density,
        }
        tracks.append(record)
        track_lookup[track_id] = record

    total_tracks = len(tracks)
    total_swears = sum(track["swear_count"] for track in tracks)

    # 1. tracksDataset.csv
    write_csv(
        DATASETS_DIR / "tracksDataset.csv",
        [
            "track_id",
            "title",
            "artists",
            "primary_artist",
            "genre",
            "release_date",
            "release_year",
            "decade",
            "characters",
            "bytes",
            "swear_count",
            "has_swear",
            "unique_swear_terms",
            "swear_density_per_1k_chars",
        ],
        [
            [
                t["track_id"],
                t["title"],
                t["artists"],
                t["primary_artist"],
                t["genre"],
                t["release_date"],
                t["release_year"],
                t["decade"],
                t["characters"],
                t["bytes"],
                t["swear_count"],
                t["has_swear"],
                t["unique_swear_terms"],
                t["swear_density_per_1k_chars"],
            ]
            for t in tracks
        ],
    )

    # 2. swear_matches_detail.csv
    detail_rows: list[list[Any]] = []
    term_occurrences: Counter[str] = Counter()
    term_tracks: dict[str, set[str]] = defaultdict(set)
    genre_term_occ: dict[str, Counter[str]] = defaultdict(Counter)
    genre_term_tracks: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    decade_term_occ: dict[str, Counter[str]] = defaultdict(Counter)
    decade_term_tracks: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    for item in raw_matches:
        track = track_lookup.get(item["track_id"])
        if not track:
            continue

        term = item["canonical_term"]
        genre = track["genre"]
        decade = track["decade"]

        term_occurrences[term] += 1
        term_tracks[term].add(track["track_id"])
        genre_term_occ[genre][term] += 1
        genre_term_tracks[genre][term].add(track["track_id"])
        decade_term_occ[decade][term] += 1
        decade_term_tracks[decade][term].add(track["track_id"])

        detail_rows.append(
            [
                track["track_id"],
                track["title"],
                track["artists"],
                genre,
                track["release_year"],
                decade,
                item["matched_text"],
                term,
            ]
        )

    write_csv(
        DATASETS_DIR / "swearMatchesDetail.csv",
        ["track_id", "title", "artists", "genre", "release_year", "decade", "matched_text", "canonical_term"],
        detail_rows,
    )

    # 3. swear_words_overall.csv (all 161 terms, including 0-occurrence terms)
    overall_terms = sorted(
        set(swear_words_catalog) | set(term_occurrences.keys()),
        key=lambda term: (-term_occurrences[term], -len(term_tracks[term]), term),
    )
    write_csv(
        DATASETS_DIR / "swearWordsOverall.csv",
        ["canonical_term", "occurrences", "tracks_with_term", "diffusion_pct", "share_of_swears_pct"],
        [
            [
                term,
                term_occurrences[term],
                len(term_tracks[term]),
                round_pct(len(term_tracks[term]), total_tracks),
                round_pct(term_occurrences[term], total_swears),
            ]
            for term in overall_terms
        ],
    )

    # Group tracks by genre, decade, decade x genre, artist
    tracks_by_genre: dict[str, list[dict[str, Any]]] = defaultdict(list)
    tracks_by_decade: dict[str, list[dict[str, Any]]] = defaultdict(list)
    tracks_by_decade_genre: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    tracks_by_artist: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for track in tracks:
        tracks_by_genre[track["genre"]].append(track)
        tracks_by_decade[track["decade"]].append(track)
        tracks_by_decade_genre[(track["decade"], track["genre"])].append(track)
        for artist in set(track["artists_list"]):
            tracks_by_artist[artist].append(track)

    # 4. swear_words_by_genre.csv
    genre_term_rows: list[list[Any]] = []
    for genre in sorted(tracks_by_genre.keys()):
        g_tracks = tracks_by_genre[genre]
        g_total_tracks = len(g_tracks)
        g_total_swears = sum(t["swear_count"] for t in g_tracks)
        for term, occ in genre_term_occ[genre].most_common():
            t_count = len(genre_term_tracks[genre][term])
            genre_term_rows.append(
                [
                    genre,
                    term,
                    occ,
                    t_count,
                    g_total_tracks,
                    round_pct(t_count, g_total_tracks),
                    round_pct(occ, g_total_swears),
                ]
            )

    write_csv(
        DATASETS_DIR / "swearWordsByGenre.csv",
        [
            "genre",
            "canonical_term",
            "occurrences",
            "tracks_with_term",
            "genre_total_tracks",
            "diffusion_in_genre_pct",
            "share_in_genre_swears_pct",
        ],
        genre_term_rows,
    )

    # 5. swear_words_by_decade.csv
    decade_term_rows: list[list[Any]] = []
    for decade in sorted(tracks_by_decade.keys()):
        d_tracks = tracks_by_decade[decade]
        d_total_tracks = len(d_tracks)
        d_total_swears = sum(t["swear_count"] for t in d_tracks)
        for term, occ in decade_term_occ[decade].most_common():
            t_count = len(decade_term_tracks[decade][term])
            decade_term_rows.append(
                [
                    decade,
                    term,
                    occ,
                    t_count,
                    d_total_tracks,
                    round_pct(t_count, d_total_tracks),
                    round_pct(occ, d_total_swears),
                ]
            )

    write_csv(
        DATASETS_DIR / "swearWordsByDecade.csv",
        [
            "decade",
            "canonical_term",
            "occurrences",
            "tracks_with_term",
            "decade_total_tracks",
            "diffusion_in_decade_pct",
            "share_in_decade_swears_pct",
        ],
        decade_term_rows,
    )

    # 6. genre_summary.csv
    genre_summary_rows: list[list[Any]] = []
    for genre, g_tracks in sorted(
        tracks_by_genre.items(),
        key=lambda entry: (-sum(t["swear_count"] for t in entry[1]), entry[0]),
    ):
        g_total = len(g_tracks)
        g_with_swear = sum(1 for t in g_tracks if t["has_swear"])
        g_swears = sum(t["swear_count"] for t in g_tracks)
        g_chars = sum(t["characters"] for t in g_tracks)
        lex = genre_lexical_stats.get(genre, {})

        genre_summary_rows.append(
            [
                genre,
                g_total,
                g_with_swear,
                round_pct(g_with_swear, g_total),
                g_swears,
                round_pct(g_swears, total_swears),
                round(g_swears / g_total, 2) if g_total else 0.0,
                round(g_swears / g_with_swear, 2) if g_with_swear else 0.0,
                g_chars,
                round((g_swears / g_chars) * 1000.0, 4) if g_chars else 0.0,
                lex.get("raw_tokens", 0),
                lex.get("filtered_tokens", 0),
                lex.get("unique_words", 0),
            ]
        )

    write_csv(
        DATASETS_DIR / "genreSummary.csv",
        [
            "genre",
            "total_tracks",
            "tracks_with_swear",
            "tracks_with_swear_pct",
            "total_swears",
            "share_of_corpus_swears_pct",
            "avg_swears_per_track",
            "avg_swears_per_swear_track",
            "total_characters",
            "swear_density_per_1k_chars",
            "raw_tokens",
            "filtered_tokens",
            "unique_words",
        ],
        genre_summary_rows,
    )

    # 7. decade_summary.csv
    decade_summary_rows: list[list[Any]] = []
    for decade in sorted(tracks_by_decade.keys()):
        d_tracks = tracks_by_decade[decade]
        d_total = len(d_tracks)
        d_with_swear = sum(1 for t in d_tracks if t["has_swear"])
        d_swears = sum(t["swear_count"] for t in d_tracks)
        d_chars = sum(t["characters"] for t in d_tracks)

        decade_summary_rows.append(
            [
                decade,
                d_total,
                d_with_swear,
                round_pct(d_with_swear, d_total),
                d_swears,
                round_pct(d_swears, total_swears),
                round(d_swears / d_total, 2) if d_total else 0.0,
                round(d_swears / d_with_swear, 2) if d_with_swear else 0.0,
                d_chars,
                round((d_swears / d_chars) * 1000.0, 4) if d_chars else 0.0,
            ]
        )

    write_csv(
        DATASETS_DIR / "decadeSummary.csv",
        [
            "decade",
            "total_tracks",
            "tracks_with_swear",
            "tracks_with_swear_pct",
            "total_swears",
            "share_of_corpus_swears_pct",
            "avg_swears_per_track",
            "avg_swears_per_swear_track",
            "total_characters",
            "swear_density_per_1k_chars",
        ],
        decade_summary_rows,
    )

    # 8. decade_by_genre_summary.csv
    decade_genre_rows: list[list[Any]] = []
    for (decade, genre) in sorted(tracks_by_decade_genre.keys()):
        dg_tracks = tracks_by_decade_genre[(decade, genre)]
        dg_total = len(dg_tracks)
        dg_with_swear = sum(1 for t in dg_tracks if t["has_swear"])
        dg_swears = sum(t["swear_count"] for t in dg_tracks)
        decade_genre_rows.append(
            [
                decade,
                genre,
                dg_total,
                dg_with_swear,
                round_pct(dg_with_swear, dg_total),
                dg_swears,
                round(dg_swears / dg_total, 2) if dg_total else 0.0,
            ]
        )

    write_csv(
        DATASETS_DIR / "decadeByGenreSummary.csv",
        [
            "decade",
            "genre",
            "total_tracks",
            "tracks_with_swear",
            "tracks_with_swear_pct",
            "total_swears",
            "avg_swears_per_track",
        ],
        decade_genre_rows,
    )

    # 9. artist_summary.csv
    artist_rows: list[list[Any]] = []
    for artist, a_tracks in sorted(
        tracks_by_artist.items(),
        key=lambda entry: (-sum(t["swear_count"] for t in entry[1]), -len(entry[1]), entry[0]),
    ):
        a_total = len(a_tracks)
        a_with_swear = sum(1 for t in a_tracks if t["has_swear"])
        a_swears = sum(t["swear_count"] for t in a_tracks)
        genres_joined = "; ".join(sorted({t["genre"] for t in a_tracks}))
        artist_rows.append(
            [
                artist,
                a_total,
                a_with_swear,
                round_pct(a_with_swear, a_total),
                a_swears,
                round(a_swears / a_total, 2) if a_total else 0.0,
                genres_joined,
            ]
        )

    write_csv(
        DATASETS_DIR / "artistSummary.csv",
        [
            "artist",
            "total_tracks",
            "tracks_with_swear",
            "tracks_with_swear_pct",
            "total_swears",
            "avg_swears_per_track",
            "genres",
        ],
        artist_rows,
    )


def main() -> None:
    """Generates all consolidated datasets in /data-analysis/datasets/."""
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    build_benchmark_datasets()
    genre_lexical_stats = build_incidence_words_datasets()
    build_linguistic_datasets(genre_lexical_stats)

    generated = sorted(DATASETS_DIR.glob("*"))
    print(f"[BuildDatasets] Generated {len(generated)} dataset files in {DATASETS_DIR}:")
    for path in generated:
        print(f"  - {path.name} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
