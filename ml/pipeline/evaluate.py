"""Entry point: python -m pipeline.evaluate"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from evaluation.evaluate import main  # noqa: E402

if __name__ == "__main__":
    main()
