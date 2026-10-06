"""Writes public/data/rivers.json from the neighbouring rivers-ua project (SPEC §4.5).

Per station: the yearly count of low-flow days (discharge below the day's p10 norm, GloFAS v4
reanalysis) and their mean over all years. The map marker sits where rivers-ua draws it: on
the river line next to the validated GloFAS cell.
"""

import json
import re

import config
from common import write_json

#: One `{ ... }` station block of station-seeds.ts and the fields read from it.
SEED_BLOCK = re.compile(r"\{\s*id: '([^']+)',(.*?)\n  \}", re.S)
FIELDS = {
    "river": re.compile(r"\n    river: '([^']+)'"),
    "place": re.compile(r"\n    place: '([^']+)'"),
    "riverEn": re.compile(r"en: \{ river: '([^']+)'"),
    "placeEn": re.compile(r"en: \{[^}]*place: '([^']+)'"),
    "markerLat": re.compile(r"marker: \{ lat: ([\d.]+)"),
    "markerLon": re.compile(r"marker: \{[^}]*lon: ([\d.]+)"),
}


def read_seeds() -> dict[str, dict[str, str]]:
    text = config.RIVERS_SEEDS.read_text(encoding="utf-8")
    seeds = {}
    for station_id, body in SEED_BLOCK.findall(text):
        found = {key: pattern.search(body) for key, pattern in FIELDS.items()}
        seeds[station_id] = {key: m.group(1) for key, m in found.items() if m}
    return seeds


def main() -> None:
    climate = json.loads(config.RIVERS_CLIMATE.read_text(encoding="utf-8"))
    cells = json.loads(config.RIVERS_STATIONS.read_text(encoding="utf-8"))["stations"]
    seeds = read_seeds()
    years = climate["years"]
    n_years = years["to"] - years["from"] + 1

    stations = []
    for station_id, data in climate["stations"].items():
        seed = seeds.get(station_id)
        if seed is None or not {"river", "place", "riverEn", "placeEn"} <= seed.keys():
            raise ValueError(f"{station_id}: no names in {config.RIVERS_SEEDS.name}")
        if len(data["lowFlowDays"]) != n_years:
            raise ValueError(f"{station_id}: {len(data['lowFlowDays'])} years instead of {n_years}")
        counts = [len(days) for days in data["lowFlowDays"]]
        lat = float(seed.get("markerLat", cells[station_id]["lat"]))
        lon = float(seed.get("markerLon", cells[station_id]["lon"]))
        stations.append(
            {
                "id": station_id,
                "river": seed["river"],
                "place": seed["place"],
                "riverEn": seed["riverEn"],
                "placeEn": seed["placeEn"],
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "lowFlowDays": counts,
                "normLowFlowDays": round(sum(counts) / n_years, 1),
            }
        )
        print(f"  {station_id:26} mean {stations[-1]['normLowFlowDays']:5.1f}, range {min(counts)}–{max(counts)}")

    data = {"years": years, "stations": stations, "source": climate["source"]}
    size = write_json(config.RIVERS_PATH, data)
    print(f"Wrote {len(stations)} stations ({size} B) to {config.RIVERS_PATH}")


if __name__ == "__main__":
    main()
