#!/usr/bin/env python3
"""Small local runner for StagePrompter's optional Demucs separation API."""
import argparse
import importlib.util
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--model', choices=('htdemucs', 'htdemucs_6s'))
    parser.add_argument('--input')
    parser.add_argument('--output')
    args = parser.parse_args()

    if args.check:
        missing = [name for name in ('torch', 'demucs') if importlib.util.find_spec(name) is None]
        if missing:
            print('Faltan dependencias: ' + ', '.join(missing) + '. Instala con: python -m pip install -U demucs', file=sys.stderr)
            return 2
        print('Python, PyTorch y Demucs disponibles.')
        return 0

    if not args.model or not args.input or not args.output:
        parser.error('Para separar se requieren --model, --input y --output.')

    command = [sys.executable, '-m', 'demucs', '-n', args.model, '-o', args.output, args.input]
    result = subprocess.run(command, check=False)
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
