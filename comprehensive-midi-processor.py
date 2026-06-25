
#!/usr/bin/env python3
"""
Comprehensive MIDI File Processor for Burnt Beats
Finds, analyzes, and integrates all unprocessed MIDI files across the system
"""

import os
import json
import mido
import shutil
from pathlib import Path
from datetime import datetime
import argparse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ComprehensiveMidiProcessor:
    def __init__(self):
        self.base_path = Path(".")
        self.storage_path = Path("storage/midi")
        self.templates_path = self.storage_path / "templates"
        self.groove_path = self.storage_path / "groove"
        self.generated_path = self.storage_path / "generated"
        
        # Initialize directories
        self._setup_directories()
        
        # Track processed files
        self.processed_files = []
        self.discovered_files = []
        self.integration_report = {
            'timestamp': datetime.now().isoformat(),
            'discovered': [],
            'processed': [],
            'errors': [],
            'categories': {
                'groove_patterns': [],
                'chord_progressions': [],
                'melodies': [],
                'templates': [],
                'samples': []
            }
        }
    
    def _setup_directories(self):
        """Setup directory structure"""
        directories = [
            self.storage_path,
            self.templates_path,
            self.templates_path / "groove-patterns",
            self.templates_path / "chord-progressions", 
            self.templates_path / "melodies",
            self.templates_path / "samples",
            self.groove_path / "categorized",
            self.generated_path
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def discover_all_midi_files(self):
        """Find all MIDI files in the system"""
        logger.info("🔍 Discovering all MIDI files in the system...")
        
        # Search patterns for MIDI files
        search_paths = [
            self.base_path / "attached_assets",
            self.base_path / "mir-data",
            self.base_path / "assets",
            self.base_path / "temp-dreamsound-repo",
            self.base_path / "uploads",
            self.base_path / "music Gen extra"
        ]
        
        midi_extensions = ['.mid', '.midi', '.MID', '.MIDI']
        
        for search_path in search_paths:
            if search_path.exists():
                for ext in midi_extensions:
                    for midi_file in search_path.rglob(f"*{ext}"):
                        if midi_file.is_file() and midi_file.stat().st_size > 0:
                            self.discovered_files.append(midi_file)
                            logger.info(f"Found: {midi_file}")
        
        logger.info(f"📊 Discovered {len(self.discovered_files)} MIDI files")
        return self.discovered_files
    
    def analyze_midi_file(self, midi_path: Path):
        """Comprehensive analysis of a MIDI file"""
        try:
            mid = mido.MidiFile(midi_path)
            
            analysis = {
                'filename': midi_path.name,
                'path': str(midi_path),
                'size': midi_path.stat().st_size,
                'length': mid.length,
                'ticks_per_beat': mid.ticks_per_beat,
                'num_tracks': len(mid.tracks),
                'tempo_changes': [],
                'time_signatures': [],
                'key_signatures': [],
                'instruments': [],
                'channels': set(),
                'note_range': {'min': 127, 'max': 0},
                'has_drums': False,
                'track_analysis': []
            }
            
            current_time = 0
            
            for track_idx, track in enumerate(mid.tracks):
                track_info = {
                    'track_index': track_idx,
                    'name': '',
                    'instrument': None,
                    'channel': None,
                    'notes': 0,
                    'is_drum_track': False
                }
                
                for msg in track:
                    current_time += msg.time
                    
                    # Track name
                    if msg.type == 'track_name':
                        track_info['name'] = msg.name
                    
                    # Program change (instrument)
                    elif msg.type == 'program_change':
                        track_info['instrument'] = msg.program
                        track_info['channel'] = msg.channel
                        analysis['channels'].add(msg.channel)
                    
                    # Note events
                    elif msg.type == 'note_on' and msg.velocity > 0:
                        track_info['notes'] += 1
                        analysis['note_range']['min'] = min(analysis['note_range']['min'], msg.note)
                        analysis['note_range']['max'] = max(analysis['note_range']['max'], msg.note)
                        
                        # Check if it's a drum track (channel 9)
                        if hasattr(msg, 'channel') and msg.channel == 9:
                            track_info['is_drum_track'] = True
                            analysis['has_drums'] = True
                    
                    # Tempo changes
                    elif msg.type == 'set_tempo':
                        bpm = mido.tempo2bpm(msg.tempo)
                        analysis['tempo_changes'].append({
                            'time': current_time,
                            'bpm': round(bpm, 2)
                        })
                    
                    # Time signature
                    elif msg.type == 'time_signature':
                        analysis['time_signatures'].append({
                            'time': current_time,
                            'numerator': msg.numerator,
                            'denominator': msg.denominator
                        })
                    
                    # Key signature
                    elif msg.type == 'key_signature':
                        analysis['key_signatures'].append({
                            'time': current_time,
                            'key': msg.key
                        })
                
                analysis['track_analysis'].append(track_info)
            
            # Determine estimated tempo
            if analysis['tempo_changes']:
                analysis['estimated_tempo'] = analysis['tempo_changes'][0]['bpm']
            else:
                analysis['estimated_tempo'] = 120
            
            # Determine time signature
            if analysis['time_signatures']:
                ts = analysis['time_signatures'][0]
                analysis['time_signature'] = f"{ts['numerator']}/{ts['denominator']}"
            else:
                analysis['time_signature'] = "4/4"
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing {midi_path}: {e}")
            return {'error': str(e), 'filename': midi_path.name, 'path': str(midi_path)}
    
    def categorize_midi_file(self, analysis):
        """Categorize MIDI file based on analysis"""
        filename = analysis['filename'].lower()
        path = analysis.get('path', '').lower()
        
        # Check for specific patterns in filename/path
        if any(keyword in filename for keyword in ['groove', 'drum', 'beat', 'rhythm']):
            return 'groove_patterns'
        elif any(keyword in filename for keyword in ['chord', 'progression', 'harmony']):
            return 'chord_progressions'
        elif any(keyword in filename for keyword in ['melody', 'lead', 'tune']):
            return 'melodies'
        elif any(keyword in path for keyword in ['sample', 'loop']):
            return 'samples'
        elif analysis.get('has_drums', False):
            return 'groove_patterns'
        elif analysis.get('num_tracks', 0) == 1:
            return 'melodies'
        elif analysis.get('num_tracks', 0) > 5:
            return 'templates'
        else:
            return 'templates'  # Default category
    
    def integrate_midi_file(self, midi_path: Path, analysis, category):
        """Integrate a MIDI file into the appropriate category"""
        try:
            # Create descriptive filename
            tempo = int(analysis.get('estimated_tempo', 120))
            time_sig = analysis.get('time_signature', '4-4').replace('/', '-')
            tracks = analysis.get('num_tracks', 0)
            
            # Clean original filename
            original_name = midi_path.stem
            
            # Create new filename
            new_filename = f"{category}_{original_name}_{tempo}bpm_{time_sig}_{tracks}tracks.mid"
            
            # Determine target directory
            if category == 'groove_patterns':
                if tempo < 80:
                    target_dir = self.groove_path / "categorized" / "slow"
                elif tempo < 120:
                    target_dir = self.groove_path / "categorized" / "medium"  
                else:
                    target_dir = self.groove_path / "categorized" / "fast"
            else:
                target_dir = self.templates_path / category.replace('_', '-')
            
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / new_filename
            
            # Copy file
            shutil.copy2(midi_path, target_path)
            
            integration_info = {
                'original_path': str(midi_path),
                'integrated_path': str(target_path),
                'category': category,
                'analysis': analysis,
                'integration_time': datetime.now().isoformat()
            }
            
            self.processed_files.append(integration_info)
            self.integration_report['categories'][category].append(integration_info)
            
            logger.info(f"✅ Integrated: {midi_path.name} → {target_path}")
            
            return integration_info
            
        except Exception as e:
            error_info = {
                'file': str(midi_path),
                'error': str(e),
                'category': category
            }
            self.integration_report['errors'].append(error_info)
            logger.error(f"❌ Failed to integrate {midi_path}: {e}")
            return None
    
    def process_all_files(self):
        """Process all discovered MIDI files"""
        logger.info("🔄 Processing all discovered MIDI files...")
        
        for midi_file in self.discovered_files:
            logger.info(f"Processing: {midi_file}")
            
            # Analyze the file
            analysis = self.analyze_midi_file(midi_file)
            self.integration_report['discovered'].append(analysis)
            
            if 'error' not in analysis:
                # Categorize the file
                category = self.categorize_midi_file(analysis)
                
                # Integrate the file
                integration = self.integrate_midi_file(midi_file, analysis, category)
                
                if integration:
                    self.integration_report['processed'].append(integration)
        
        # Save integration report
        self._save_integration_report()
        
        logger.info(f"🎉 Processing complete!")
        logger.info(f"   Discovered: {len(self.discovered_files)} files")
        logger.info(f"   Processed: {len(self.processed_files)} files") 
        logger.info(f"   Errors: {len(self.integration_report['errors'])} files")
    
    def _save_integration_report(self):
        """Save comprehensive integration report"""
        report_path = self.storage_path / "comprehensive_integration_report.json"
        
        with open(report_path, 'w') as f:
            json.dump(self.integration_report, f, indent=2, default=str)
        
        logger.info(f"📊 Integration report saved: {report_path}")
    
    def generate_catalog(self):
        """Generate comprehensive MIDI catalog"""
        logger.info("📚 Generating comprehensive MIDI catalog...")
        
        catalog = {
            'timestamp': datetime.now().isoformat(),
            'total_files': len(self.processed_files),
            'categories': {},
            'tempo_distribution': {},
            'time_signature_distribution': {},
            'track_count_distribution': {}
        }
        
        # Analyze distributions
        for file_info in self.processed_files:
            analysis = file_info['analysis']
            category = file_info['category']
            
            # Category counts
            if category not in catalog['categories']:
                catalog['categories'][category] = 0
            catalog['categories'][category] += 1
            
            # Tempo distribution
            tempo = int(analysis.get('estimated_tempo', 120))
            tempo_range = f"{tempo//10*10}-{tempo//10*10+9}"
            if tempo_range not in catalog['tempo_distribution']:
                catalog['tempo_distribution'][tempo_range] = 0
            catalog['tempo_distribution'][tempo_range] += 1
            
            # Time signature distribution
            time_sig = analysis.get('time_signature', '4/4')
            if time_sig not in catalog['time_signature_distribution']:
                catalog['time_signature_distribution'][time_sig] = 0
            catalog['time_signature_distribution'][time_sig] += 1
            
            # Track count distribution
            tracks = analysis.get('num_tracks', 0)
            track_range = f"{tracks} tracks"
            if track_range not in catalog['track_count_distribution']:
                catalog['track_count_distribution'][track_range] = 0
            catalog['track_count_distribution'][track_range] += 1
        
        # Save catalog
        catalog_path = self.storage_path / "comprehensive_midi_catalog.json"
        with open(catalog_path, 'w') as f:
            json.dump(catalog, f, indent=2)
        
        logger.info(f"📊 Comprehensive catalog saved: {catalog_path}")
        return catalog

def main():
    parser = argparse.ArgumentParser(description='Comprehensive MIDI Processing')
    parser.add_argument('--discover', action='store_true', help='Discover all MIDI files')
    parser.add_argument('--process', action='store_true', help='Process and integrate all files')
    parser.add_argument('--catalog', action='store_true', help='Generate comprehensive catalog')
    parser.add_argument('--all', action='store_true', help='Run complete processing pipeline')
    
    args = parser.parse_args()
    
    processor = ComprehensiveMidiProcessor()
    
    if args.all or not any([args.discover, args.process, args.catalog]):
        # Run complete pipeline
        processor.discover_all_midi_files()
        processor.process_all_files()
        processor.generate_catalog()
    else:
        if args.discover:
            processor.discover_all_midi_files()
        if args.process:
            processor.discover_all_midi_files()
            processor.process_all_files()
        if args.catalog:
            processor.generate_catalog()

if __name__ == "__main__":
    main()
