"""
Deterministic, seed-driven generation of realistic-sounding but entirely
fictional company names. Used only for synthetic demo data — never
real companies, never "Company A / John Doe" placeholders.
"""
from __future__ import annotations

import numpy as np

_PREFIXES = [
    "North", "Summit", "Harbor", "Cedar", "Vantage", "Crescent", "Meridian",
    "Foundry", "Lumen", "Anchor", "Ridge", "Bay", "Orbit", "Union", "Cobalt",
    "Bright", "Clearwater", "Ironwood", "Silver", "Atlas", "Beacon", "Delta",
    "Granite", "Hollow", "Juniper", "Kestrel", "Lattice", "Mosaic", "Nimbus",
    "Outpost", "Pinecrest", "Quarry", "Redwood", "Sable", "Timberline",
    "Vellum", "Westgate", "Yarrow", "Zephyr", "Cascade",
]

_SUFFIXES = [
    "Logistics", "Analytics", "Health", "Retail Group", "Financial",
    "Manufacturing", "Media", "Labs", "Systems", "Partners", "Digital",
    "Foods", "Robotics", "Networks", "Insurance", "Materials", "Studios",
    "Freight", "Energy", "Dynamics", "Ventures", "Technologies", "Apparel",
    "Bioworks", "Capital", "Learning", "Mobility", "Publishing", "Realty",
]

_FIRST_NAMES = [
    "Amara", "Devon", "Priya", "Marcus", "Elena", "Kofi", "Ingrid", "Rafael",
    "Naomi", "Tobias", "Sana", "Hugo", "Freya", "Idris", "Camila", "Ravi",
    "Zoe", "Anders", "Lucia", "Mateo", "Yusuf", "Aisling", "Diego", "Noor",
    "Soren", "Kiara", "Tomas", "Wren", "Bashir", "Elif",
]

_LAST_NAMES = [
    "Whitfield", "Nakamura", "Alvarez", "Okafor", "Berglund", "Petrov",
    "Almeida", "Larsson", "Haddad", "Voss", "Kowalski", "Reyes", "Lindqvist",
    "Osei", "Marchetti", "Solis", "Novak", "Dubois", "Adeyemi", "Bergman",
]


def generate_company_names(n: int, rng: np.random.Generator) -> list[str]:
    used = set()
    names = []
    while len(names) < n:
        prefix = rng.choice(_PREFIXES)
        suffix = rng.choice(_SUFFIXES)
        candidate = f"{prefix} {suffix}"
        if candidate in used:
            # disambiguate deterministically rather than looping forever
            candidate = f"{candidate} {len(names) + 1}"
        used.add(candidate)
        names.append(candidate)
    return names


def generate_contact_names(n: int, rng: np.random.Generator) -> list[str]:
    first = rng.choice(_FIRST_NAMES, size=n, replace=True)
    last = rng.choice(_LAST_NAMES, size=n, replace=True)
    return [f"{f} {l}" for f, l in zip(first, last)]
