# vadslice

Slices audio clips of speech into chunks of certain length in seconds at silence points so it doesn't cut in the middle of someone speaking. It uses VAD (voice activity detection from [silero-vad](https://github.com/snakers4/silero-vad)) to determine these points of silence within the clip.

Uses ONNX runtime instead of PyTorch, avoiding the heavy PyTorch dependency while maintaining the same VAD accuracy.

It's extremely fast. 


## Installation

Requires Python 3.12+.

```bash
uv add vadslice
```

or pip:

```bash
pip install vadslice
```

## Usage

### CLI

```bash
vadslice <size> <input_file> <output_dir> [--format wav|mp3|ogg|m4a] [--silence-flush SECONDS]
```

Example:
```bash
vadslice 30 audio.mp3 ./chunks --format mp3

# Flush a chunk early if there's a 5+ second silence gap
vadslice 30 audio.mp3 ./chunks --silence-flush 5
```

Chunks are saved to `output_dir/input_file_stem/chunk_XXXX_offset_XX.XXs.ext`. `--format` is the output format.

Input: Supports any audio format that PyAV can decode (MP3, WAV, OGG, M4A, FLAC, etc.)

### Python API

```python
from vadslice import slicer

parts = slicer("audio.mp3", slice_length_s=30.0)

# Optionally flush chunks on long silence gaps
parts = slicer("audio.mp3", slice_length_s=30.0, silence_flush_s=5.0)

for i, part in enumerate(parts):
    print(f"Part {i}: Offset: {part.offset_s}s, Size: {len(part.part)} bytes")
```

The function `slicer` returns a list of `AudioPart` objects, each containing:
- `part`: WAV bytes (16 kHz mono) for that slice
- `offset_s`: Start time offset in seconds from the original audio

.



