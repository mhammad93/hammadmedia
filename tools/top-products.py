#!/usr/bin/env python3
"""Regenerate the receipts data block from TikTok Shop Product Analytics XLSX exports.

Usage:
    uv run --with pandas --with openpyxl python tools/top-products.py \
        "/mnt/c/Users/moham/Downloads/2026 YTD Product Analytics Drew.Review.xlsx" \
        "/mnt/c/Users/moham/Downloads/2026 YTD Product Analytics Drew.Review1.xlsx" \
        [top_n]

Prints a content.json-ready `receipts.items` JSON array plus the meta stats.
Commission columns are read but never emitted.
"""

import json
import sys

import pandas as pd


def load(path: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0, header=None, skiprows=3, dtype=str)
    # Columns: pid, name, gross, [commission], units — commission present only on some exports
    ncols = df.shape[1]
    names = ["pid", "name", "gross", "comm", "units"][:ncols] if ncols >= 5 else ["pid", "name", "gross", "units"]
    df = df.iloc[:, : len(names)]
    df.columns = names
    df = df.dropna(subset=["name", "gross"])
    df["gross"] = df["gross"].str.replace(r"[$,]", "", regex=True).astype(float)
    df["units"] = df["units"].str.replace(",", "").astype(float)
    return df[["pid", "name", "gross", "units"]]


def main() -> None:
    paths = sys.argv[1:3]
    top_n = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    frames = [load(p) for p in paths]
    both = pd.concat(frames)
    agg = (
        both.groupby("pid")
        .agg(name=("name", "first"), gross=("gross", "sum"), units=("units", "sum"))
        .sort_values("gross", ascending=False)
    )
    meta = {
        "tested": int(len(agg)),
        "totalGross": round(float(agg.gross.sum()), 2),
        "totalUnits": int(agg.units.sum()),
        "past10k": int((agg.gross > 10_000).sum()),
        "past50k": int((agg.gross > 50_000).sum()),
        "past100k": int((agg.gross > 100_000).sum()),
    }
    items = [
        {"pid": pid, "title": r["name"], "ytd": int(round(r.gross)), "units": int(r.units)}
        for pid, r in agg.head(top_n).iterrows()
    ]
    print(json.dumps({"meta": meta, "items": items}, indent=2))


if __name__ == "__main__":
    main()
