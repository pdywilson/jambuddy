const probDict = {
    'C': [0.5,0,0,0,0.3,0,0,0.2,0,0,0,0],
};

const kesslerProbs = {
    'major': [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    'minor': [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

const aardenProbs = {
    'major': [17.7661, 0.145624, 14.9265, 0.160186, 19.8049, 11.3587, 0.281248, 22.062, 0.145624, 8.15494, 0.232998, 4.95122],
    'minor': [18.2648, 0.737619, 14.0499, 16.8599, 0.702494, 14.4362, 0.702494, 18.6161, 4.56621, 1.93186, 7.37619, 1.75623],
};

function sample(probs) {
    const sum = probs.reduce((a, b) => a + b, 0);
    const normalized = probs.map(prob => prob / sum);
    const sample = Math.random();
    let total = 0;
    for (let i = 0; i < normalized.length; i++) {
        total += normalized[i];
        if (sample < total){
            return i;}
    }
}

function getNote(chord) {
    let probs = aardenProbs['major'];
    if (chord.includes('-')) {
        probs = aardenProbs['minor'];}

    return sample(probs);
}

function getChords() {
    const chord1 = document.querySelector('#firstChord').value;
    const chord2 = document.querySelector('#secondChord').value;
    const chord3 = document.querySelector('#thirdChord').value;
    const chord4 = document.querySelector('#fourthChord').value;
    let chords = [chord1,chord2,chord3,chord4];
    return chords;
}

play = function () {
	MIDI.loadPlugin({
		soundfontUrl: "./soundfonts/",
		instrument: "acoustic_grand_piano",
		onprogress: function(state, progress) {
			console.log(state, progress);
		},
		onsuccess: function() {
            const ch = 0; //channel
            const length = 1/8;
            const bar = 2/length;
			const velocity = 127;
            const num_ticks = document.querySelector('#numNotes').value;
            const offset = 1;

            function playNote(note, start, end) {
                MIDI.noteOn(ch, note, velocity, start);
                MIDI.noteOff(ch, note, end);
            }

            function getChordNote(chord) {
                return Tonal.note(chord.replace('-','')+'3').midi;
            }

            function playChord(chord, start, end) {
                let chordNote = getChordNote(chord);
                playNote(chordNote, start, end);
                if (chord.includes('-')) {
                    playNote(chordNote+3, start, end);}
                else {
                    playNote(chordNote+4, start, end);}

                playNote(chordNote+7, start, end);
            }

            // Play notes

            let chords = getChords();
            let curr = 0;

            for(let [i, elt] of nj.arange(num_ticks).selection.data.entries()){
                const rhythm = document.querySelector('#melodyRhythm').value;
                if (curr > 3) {
                    curr = 0;}
                let chord = chords[curr];
                if (i % bar == bar-1) {
                    curr += 1;}

                let start = offset + i*length;
                let end = offset + (i+1)*length;

                let chordNote = getChordNote(chord);
                let next = getNote(chord) + chordNote;

                //different rhythms
                if (rhythm === 'Straight 8th'){
                    if (i % bar === 0) {
                        playChord(chord, start, end*bar);}
                    if (i%2 === 0){
                        playNote(next, start, end);}
                } else if (rhythm === 'Straight 16th'){
                    if (i % bar === 0) {
                        playChord(chord, start, end*bar);}
                    playNote(next, start, end);
                } else if (rhythm === 'Scotch Snaps 8th'){
                    if (i % bar === 0) {
                        playChord(chord, start, end*bar);}

                    if (i % 4 === 0 || i%4 === 1) {
                        playNote(next, start, end);}
                } else if (rhythm === 'Swing 8th'){
                    if (i % (bar*3/4) == 0) {
                        playChord(chord, start, end*bar);}

                    if (i % 3 === 0 || i%6 === 5) {
                        playNote(next, start, end);}
                }
            }
		}
	});
};
