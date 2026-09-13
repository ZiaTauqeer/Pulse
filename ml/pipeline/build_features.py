"""Entry point: python -m pipeline.build_features"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from features.build_features import main  # noqa: E402

if __name__ == "__main__":
    main()
