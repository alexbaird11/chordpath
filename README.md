# ChordPath
Single-file HTML piano sight reading trainer. All logic in one index.html.

## Architecture
- Pure HTML/CSS/JS, no frameworks, no build step
- Web Audio API for mic pitch detection (autocorrelation)
- Web MIDI API for keyboard input
- Canvas-based staff and piano rendering

## Features
- 5 difficulty levels: single notes → intervals → triads → 7th chords → progressions
- Treble, bass, and grand staff modes
- Metronome with time signature, subdivisions, count-in
- Exercise builder: custom roots, chord types, inversions, rhythm mode
- Stats tracking: accuracy by level, weak note detection

## Known limitations / future ideas
- Mic detection unreliable for chords (MIDI recommended)
- No persistent score storage yet
- Could add: bass clef exercises, rhythm notation, user accounts
