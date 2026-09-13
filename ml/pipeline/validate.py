"""Entry point: python -m pipeline.validate"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from validation.data_quality import main  # noqa: E402

if __name__ == "__main__":
    main()
