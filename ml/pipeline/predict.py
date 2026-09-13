"""Entry point: python -m pipeline.predict --customer_id CUS-100000"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from inference.predict import main  # noqa: E402

if __name__ == "__main__":
    main()
