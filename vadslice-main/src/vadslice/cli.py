"""CLI tool to slice audio files into chunks using VAD."""

import argparse
import io
import sys
from pathlib import Path
import av

from .core import slicer, SAMPLE_RATE


def convert_wav_bytes_to_format(wav_bytes: bytes, output_format: str) -> bytes:
    """
    Convert WAV bytes to another audio format using pyav.

    Args:
        wav_bytes: WAV file bytes (16 kHz mono)
        output_format: Output format (e.g., 'mp3', 'ogg', 'm4a', 'wav')

    Returns:
        Converted audio bytes in the specified format
    """
    if output_format.lower() == "wav":
        return wav_bytes

    # Map format to codec and container
    format_codec_map: dict[str, str] = {
        "mp3": "libmp3lame",
        "ogg": "libvorbis",
        "m4a": "aac",
    }
    
    # Map format to container format (some formats need specific containers)
    format_container_map: dict[str, str] = {
        "m4a": "mp4",  # M4A uses MP4 container
    }

    codec_name = format_codec_map.get(output_format.lower())
    if codec_name is None:
        # Try to use format name as codec name
        codec_name = output_format.lower()

    # Read WAV bytes
    input_container = av.open(io.BytesIO(wav_bytes), format="wav")
    audio_stream = next(s for s in input_container.streams if s.type == "audio")

    # Create output container in memory
    output_buffer = io.BytesIO()
    container_format = format_container_map.get(output_format.lower(), output_format.lower())
    output_container = av.open(output_buffer, mode="w", format=container_format)

    # Add audio stream to output with appropriate codec
    try:
        output_stream = output_container.add_stream(codec_name, rate=SAMPLE_RATE)  # type: ignore[arg-type]
    except Exception:
        # Fallback: try default codec for the format
        output_stream = output_container.add_stream(rate=SAMPLE_RATE)  # type: ignore[arg-type]
    
    # Type narrowing: we know this is an AudioStream
    if not isinstance(output_stream, av.AudioStream):
        raise ValueError("Expected audio stream")
    
    # Set stream properties
    output_stream.rate = SAMPLE_RATE  # type: ignore[assignment]
    output_stream.layout = "mono"  # type: ignore[assignment]

    # Copy frames from input to output
    for frame in input_container.decode(audio_stream):  # type: ignore[attr-defined]
        if isinstance(frame, av.AudioFrame):
            frame.pts = None  # Let encoder set PTS
            for packet in output_stream.encode(frame):  # type: ignore[arg-type]
                output_container.mux(packet)

    # Flush encoder
    for packet in output_stream.encode():  # type: ignore[call-overload]
        output_container.mux(packet)

    output_container.close()
    input_container.close()

    return output_buffer.getvalue()


def main() -> None:
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="Slice an audio file into chunks using VAD (Voice Activity Detection)"
    )
    parser.add_argument(
        "-fmt",
        "--format",
        type=str,
        default="wav",
        help="Output format (default: wav). Supported formats: wav, mp3, ogg, m4a",
    )
    parser.add_argument(
        "--silence-flush",
        type=float,
        default=None,
        help="Flush a chunk after this many seconds of silence, regardless of chunk length",
    )
    parser.add_argument(
        "size",
        type=int,
        help="Minimum length in seconds for each slice",
    )
    parser.add_argument(
        "input_file",
        type=str,
        help="Path to the audio file to slice",
    )
    parser.add_argument(
        "output_dir",
        type=str,
        help="Output directory where chunks will be saved",
    )

    args = parser.parse_args()

    # Validate input file exists
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file '{input_path}' does not exist.", file=sys.stderr)
        sys.exit(1)

    if not input_path.is_file():
        print(f"Error: '{input_path}' is not a file.", file=sys.stderr)
        sys.exit(1)

    # Validate size
    if args.size <= 0:
        print(
            f"Error: size must be positive, got {args.size}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Create output directory structure
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectory named after the input file stem
    chunk_dir = output_dir / input_path.stem
    chunk_dir.mkdir(parents=True, exist_ok=True)

    # Slice the audio file
    print(f"Slicing '{input_path}' into chunks...")
    try:
        parts = slicer(input_path, slice_length_s=float(args.size), silence_flush_s=args.silence_flush)
    except Exception as e:
        print(f"Error slicing audio: {e}", file=sys.stderr)
        sys.exit(1)

    if not parts:
        print("Warning: No audio chunks were generated.", file=sys.stderr)
        sys.exit(0)

    # Determine file extension from format
    fmt_ext = args.format.lower()
    if fmt_ext == "wav":
        ext = ".wav"
    elif fmt_ext == "mp3":
        ext = ".mp3"
    elif fmt_ext == "ogg":
        ext = ".ogg"
    elif fmt_ext == "m4a":
        ext = ".m4a"
    else:
        ext = f".{fmt_ext}"

    # Save each chunk in the specified format
    print(f"Saving {len(parts)} chunk(s) to '{chunk_dir}' in {args.format} format...")
    for i, part in enumerate(parts, start=1):
        chunk_filename = chunk_dir / f"chunk_{i:04d}_offset_{part.offset_s:.2f}s{ext}"

        try:
            if args.format.lower() == "wav":
                chunk_filename.write_bytes(part.part)
            else:
                converted_bytes = convert_wav_bytes_to_format(part.part, args.format)
                chunk_filename.write_bytes(converted_bytes)
            print(f"  Saved: {chunk_filename.name}")
        except Exception as e:
            print(
                f"Error converting/saving chunk {i}: {e}",
                file=sys.stderr,
            )
            sys.exit(1)

    print(f"\nDone! {len(parts)} chunk(s) saved to '{chunk_dir}'")


if __name__ == "__main__":
    main()

