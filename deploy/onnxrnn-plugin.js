CindyJS.registerPlugin(1, "onnxrnn", function(api) {
    //inspired by https://github.com/montaga/montaga.github.io/blob/master/posenet/posenet-plugin.js
    //also adapted from Tero Parviainen's https://codepen.io/teropa/pen/ddqEwj


    //CindyJS Helpers
    var cloneExpression = function(obj) {
    var copy;
    if (null == obj || "object" != typeof obj) return obj;
    if (obj instanceof Array) {
      copy = [];
      for (var i = 0, len = obj.length; i < len; i++) {
        copy[i] = cloneExpression(obj[i]);
      }
      return copy;
    }

    if (obj instanceof Object) {
      copy = {};
      for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) {
          if (['oper', 'impl', 'args', 'ctype', 'stack', 'name', 'arglist', 'value', 'real', 'imag', 'key', 'obj', 'body'].indexOf(attr) >= 0)
            copy[attr] = cloneExpression(obj[attr]);
        }
      }
      if (obj['modifs']) copy['modifs'] = obj['modifs']; //modifs cannot be handeled in recursion properly
      return copy;
    }
};

    var real = function(r) {
        return {
          "ctype": "number",
          "value": {
            'real': r,
            'imag': 0
          }
        };
      };

      var list = function(l) {
        return {
          'ctype': 'list',
          'value': l
        };
      };

      var wrap = function(v) {
    if (typeof v === "number") {
      return real(v);
    }
    if (typeof v === "object" && v.length !== undefined) {
      var li = [];
      for (var i = 0; i < v.length; i++) {
        li[i] = wrap(v[i]);
      }
      return list(li);
    }
    if (typeof v === "string") {
      return {
        ctype: "string",
        value: v
      };
    }
    if (typeof v === "boolean") {
      return {
        ctype: "boolean",
        value: v
      };
    }
    return nada;
  };
  var recreplace = function(ex, rmap) {
    if (ex.ctype === "variable" && rmap[ex.name]) {
      return rmap[ex.name];
    } else {
      if (ex.args)
        ex.args = ex.args.map(e => recreplace(e, rmap));
      return ex;
    }
  };

  var unwrap = function(v) {
      if (typeof v !== "object" || v === null) {
          return v;
      }
      if (Array.isArray(v)) {
          return v.map(unwrap);
      }
      switch (v.ctype) {
          case "string":
          case "boolean":
              return v.value;
          case "number":
              if (v.value.imag === 0)
                  return v.value.real;
              return {
                  r: v.value.real,
                  i: v.value.imag
              };
          case "list":
              return v.value.map(unwrap);
          default:
              return null;
      }
  };

  // end CindyJS Helpers
/*
  let rnn = new mm.MusicRNN(
      'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
  );
*/



let modelLoaded = false;



    function oneHot(idx, arraysize) {
        ar = new Array(arraysize).fill(0);
        if (idx >= arraysize) {
          console.error("error idx > arraysize",idx, arraysize);
          return ar;
        }
        ar[idx] = 1;
        return ar;
    }
function getCircleOfThirds(note) {
    let circleMajor = x => x%4;
    let circleMinor = x => x%3;
    representation = new Array(11).fill(0);
    if (note < MELODY-1){
        absnote = note % 12;
        octave = parseInt(note/12,10);
        representation[7+octave] = 1;
        representation[circleMajor(absnote)] = 1;
        representation[4+circleMinor(absnote)] = 1;
      }else {
        representation[-1] = 1
      }
    return representation
  }



 function getFeatureVectors(notes, times, chords) {
     encodingDict = {
         'melody': true,
         'melodyModulo': true,
         'melodyEncoded': false,
         'duration': true,
         'durationEncoded': false,
         'chordsNormally': true,
         'chordsEncoded': false
     }
    features = [];
    for(const [i, note] of notes.slice(0,-1).entries()){
        let feature = [];
        if (encodingDict['melody']){
            if (notes[i] < MELODY){ // pitch or pause bit
                feature = feature.concat(oneHot(notes[i],MELODY));
            } else {
                console.log("melody over 37");
                feature = feature.concat(new Array(MELODY).fill(0));
            }
        }
        if (encodingDict['melodyModulo']){
            if (notes[i] < MELODY-1) { // # only pitch bit or zeros if pause
                feature = feature.concat(oneHot(notes[i]%12,12));
            } else {
                feature = feature.concat(new Array(12).fill(0));
            }
        }
        if (encodingDict['melodyEncoded']) feature = feature.concat(getCircleOfThirds(note));
        if (encodingDict['duration']) feature = feature.concat(oneHot(parseInt(times[i],10),48));
        if (encodingDict['chordsNormally']){
            feature = feature.concat(chords[i]);
            feature = feature.concat(chords[i+1]);
        }
        features.push(feature);
      }
    const featuresTensor = new tf.tensor2d(features);
    return featuresTensor;
  }

    let chord = [1,0,0,0,1,0,0,1,0,0,1,0];
    let chords = new Array(17).fill(chord);
    let notes = new Array(17).fill(1);
    let times = new Array(17).fill(7);

    async function getPrediction(input) {
      if (!modelLoaded) {
          model = await tf.loadLayersModel('tfjs/model.json');
          modelLoaded = true;
      }

      const output = model.predict(input);
      //const pitch = await output[0].argMax(axis=1).data();
      //const duration = await output[1].argMax(axis=1).data();
      //try sampling
      const pitch = await output[0].data();
      const duration = await output[1].data();

      let pitems = [];
      for (const [i, elt] of pitch.entries()){pitems.push([i, elt]);}
      pitems.sort(function(first, second) {return second[1] - first[1];});

      pitems = pitems.slice(0,5);
      let psum = 0;
      for (const elt of pitems) { psum += elt[1]; }
      for (const [i,elt] of pitems.entries()) { pitems[i][1] = elt[1]/psum;}


      let r1 = Math.random();
      let r2 = Math.random();
      let s1 = 0;
      let i1 = 0;
      while(s1 < r1){
          s1 += duration[i1];
          i1 += 1;
      }
      let s2 = 0;
      let i2 = 0;
      while(s2 < r2){
          s2 += pitems[i2][1];
          i2 += 1;
      }
      const duration_sampled = i1-1;
      const pitch_i= i2-1;
      const sampled_pitch = pitems[pitch_i][0];

    return [sampled_pitch, duration_sampled];
    }

    //let input = getFeatureVectors(notes, times, chords);
    //input = tf.expandDims(input,0);
    //const output = getPrediction(input);

    function time_to_tick(time){
        return parseInt(time*TIMES,10);
    }
    function tick_to_time(tick){
        return tick/TIMES;
    }

    function getNotesAndDurations(inputmelody){
        let notes = [];
        let times = [];
        let oldtime = 0;
        for (let elt of inputmelody){
            if (elt[1] < oldtime){//current begins before last ends
                if (elt[2] < oldtime){//current begins and ends before last ends
                    continue;
                } else {//begin of current until end of last
                    notes.push(elt[0]-LOW);
                    times.push(time_to_tick(elt[2]-oldtime));
                }
            } else {//begin of current until end of current
                notes.push(elt[0]-LOW);
                times.push(time_to_tick(elt[2]-elt[1]));
                oldtime = elt[2];
            }
        }
        return [notes, times];
    }
    function getCindyMelody(notes, times){
        melody = [];
        currenttick = 0;
        for (let [i,note] of notes.entries()){
            if (note == MELODY-1) {note = "p"}
            else { note = note+LOW};
            melody.push([note, tick_to_time(times[i])]);
        }
        return melody;
    }




    let processrunning = false;
    async function getMelody(inputmelody, cdycallback) {
        if (processrunning) return;
        processrunning = true;

        LOW = 48; // C2=48, C3=60, C4=72, C5=84, C6=96
        HIGH = 84; //range(48,84) = 36 notes
        MELODY = 37;
        TIMES = 48;
        CHORDS = 12;


        const notesAndDurations = getNotesAndDurations(inputmelody);
        let chordC = [1,0,0,0,1,0,0,1,0,0,0,0];
        let chordF = [1,0,0,0,0,1,0,0,0,1,0,0];
        let chordsC = new Array(8).fill(chordC);
        let chordsF = new Array(9).fill(chordF);
        let chords = chordsC.concat(chordsF);

        let predicted_durations=[];
        let predicted_notes = [];
        const mel_len = 16+1;

        notesnew = notesAndDurations[0].slice(-mel_len);
        timesnew = notesAndDurations[1].slice(-mel_len);
        chordsnew = chords;

        //cut timesarray SCHLAMPIG!
        for (const [i,time] of timesnew.entries()){
            if ( time > TIMES){
                timesnew[i] = TIMES-1;
            }
        }

        //padding Test
        while (notesnew.length < mel_len){
            notesnew.unshift(12);
            timesnew.unshift(parseInt((TIMES/8-1),10));
        }

        //predict iteratively
        let currtime = 0;
        while (currtime < 4*TIMES){
            let feat = getFeatureVectors(notesnew, timesnew, chordsnew);
            let input = tf.expandDims(feat,0);
            let pred = await getPrediction(input);
            predicted_notes.push(pred[0]);
            predicted_durations.push(pred[1]);
            notesnew = notesnew.slice(1).concat(pred[0]);
            timesnew = timesnew.slice(1).concat(pred[1]);
            let currbeat = parseInt((currtime+pred[1])/12,10) - parseInt(currtime/12, 10);
            chordsnew = chordsnew.slice(currbeat).concat(chordsnew.slice(0,currbeat));
            currtime += pred[1];
        }

        const improvisedMelody = getCindyMelody(predicted_notes, predicted_durations);
        console.log(improvisedMelody);
        cdymelody = wrap(improvisedMelody);

        api.evaluate(recreplace(cdycallback, {'m': cdymelody}));

        processrunning = false;
    };

    api.defineFunction("continueSequence", 2, function(args, modifs) {
        if (processrunning) {
            console.log("skip continueSequence, because process is already running");
            return api.nada;
        }

        let inputmelody = unwrap(api.evaluate(args[0]));

        getMelody(inputmelody,cloneExpression(args[1]));
        return api.nada;
    });
});