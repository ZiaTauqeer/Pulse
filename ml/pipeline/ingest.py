"""Entry point: python -m pipeline.ingest [--external path.csv]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ingestion.loader import main  # noqa: E402

if __name__ == "__main__":
    main()
