"""
Entry point: python -m pipeline.generate_synthetic [--seed N]

Thin wrapper around src/synthetic/generate.py so the documented command
structure in the README stays stable even if the underlying implementation
module moves around.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from synthetic.generate import main  # noqa: E402

if __name__ == "__main__":
    main()
