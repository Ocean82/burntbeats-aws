//! Phase inversion: instrumental = original - vocals (per AGENT-GUIDE).
//! Reads WAV, subtracts sample-by-sample, clips to [-1, 1], writes.

use hound::{WavReader, WavSpec, WavWriter};
use std::io;
use std::path::Path;

#[derive(Debug)]
pub enum PhaseInversionError {
    Io(io::Error),
    Hound(hound::Error),
    Mismatch(String),
}

impl From<io::Error> for PhaseInversionError {
    fn from(e: io::Error) -> Self {
        PhaseInversionError::Io(e)
    }
}

impl From<hound::Error> for PhaseInversionError {
    fn from(e: hound::Error) -> Self {
        PhaseInversionError::Hound(e)
    }
}

/// Read WAV into f32 samples (handles 16-bit and 32-bit; Demucs defaults to 16-bit).
fn read_wav_f32<P: AsRef<Path>>(path: P) -> Result<(WavSpec, Vec<f32>), PhaseInversionError> {
    let mut reader = WavReader::open(path)?;
    let spec = reader.spec();
    let samples: Vec<f32> = match (spec.bits_per_sample, spec.sample_format) {
        (16, hound::SampleFormat::Int) => reader
            .samples::<i16>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(PhaseInversionError::Hound)?
            .into_iter()
            .map(|s| s as f32 / 32768.0)
            .collect(),
        (32, hound::SampleFormat::Int) => reader
            .samples::<i32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(PhaseInversionError::Hound)?
            .into_iter()
            .map(|s| s as f32 / i32::MAX as f32)
            .collect(),
        (32, hound::SampleFormat::Float) => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(PhaseInversionError::Hound)?,
        _ => {
            return Err(PhaseInversionError::Mismatch(format!(
                "unsupported WAV format: {} bit {:?}",
                spec.bits_per_sample, spec.sample_format
            )))
        }
    };
    Ok((spec, samples))
}

/// Create instrumental = original - vocals; write to output_path.
/// Clips to [-1.0, 1.0]. Uses minimum length of the two files.
pub fn create_perfect_instrumental(
    original_path: &Path,
    vocal_path: &Path,
    output_path: &Path,
) -> Result<(), PhaseInversionError> {
    let (spec_orig, orig) = read_wav_f32(original_path)?;
    let (spec_vocal, vocal) = read_wav_f32(vocal_path)?;

    if spec_orig.channels != spec_vocal.channels {
        return Err(PhaseInversionError::Mismatch(format!(
            "channel count mismatch: {} vs {}",
            spec_orig.channels, spec_vocal.channels
        )));
    }
    if spec_orig.sample_rate != spec_vocal.sample_rate {
        return Err(PhaseInversionError::Mismatch(format!(
            "sample rate mismatch: {} vs {}",
            spec_orig.sample_rate, spec_vocal.sample_rate
        )));
    }

    let len = orig.len().min(vocal.len());
    let instrumental: Vec<f32> = orig
        .into_iter()
        .take(len)
        .zip(vocal.into_iter().take(len))
        .map(|(o, v)| (o - v).clamp(-1.0, 1.0))
        .collect();

    let spec_out = WavSpec {
        channels: spec_orig.channels,
        sample_rate: spec_orig.sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut writer = WavWriter::create(output_path, spec_out)?;
    for s in instrumental {
        writer.write_sample(s)?;
    }
    writer.finalize()?;
    Ok(())
}
