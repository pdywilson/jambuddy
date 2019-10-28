CindyJS.registerPlugin(1, "rnnwd4", function(api) {
    //inspired by https://github.com/montaga/montaga.github.io/blob/master/posenet/posenet-plugin.js

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



    // GLOBALS
    let modelLoaded = false;
    const LOW = 48; // C2=48, C3=60, C4=72, C5=84, C6=96
    const HIGH = 84; //range(48,84) = 36 notes
    const MELODY = 37;
    const TIMES = 48;
    const CHORDS = 12;




    //Helpers for getFeatureVector
    function oneHot(idx, arraysize) {
        ar = new Array(arraysize).fill(0);
        if (idx >= arraysize) {
            console.error("error idx > arraysize", idx, arraysize);
            return ar;
        }
        ar[idx] = 1;
        return ar;
    }

    function getCircleOfThirds(note) {
        let circleMajor = x => x % 4;
        let circleMinor = x => x % 3;
        representation = new Array(11).fill(0);
        if (note < MELODY - 1) {
            absnote = note % 12;
            octave = parseInt(note / 12, 10);
            representation[7 + octave] = 1;
            representation[circleMajor(absnote)] = 1;
            representation[4 + circleMinor(absnote)] = 1;
        } else {
            representation[-1] = 1
        }
        return representation
    }



    function getFeatureVectors(notes, durations, chords, key) {
        encodingDict = {
            'melody': true,
            'melodyModulo': true,
            'melodyEncoded': false,
            'duration': true,
            'durationEncoded': false,
            'chordsNormally': true,
            'chordsEncoded': false,
            'key': false
        }
        features = [];
        for (const [i, note] of notes.entries()) {
            let feature = [];
            if (encodingDict['melody']) {
                if (notes[i] < MELODY) { // pitch or pause bit
                    feature = feature.concat(oneHot(notes[i], MELODY));
                } else {
                    console.log("melody over 37 or pause");
                    feature = feature.concat(new Array(MELODY).fill(0));
                }
            }
            if (encodingDict['melodyModulo']) {
                if (notes[i] < MELODY - 1) { // # only pitch bit or zeros if pause
                    feature = feature.concat(oneHot(notes[i] % 12, 12));
                } else {
                    feature = feature.concat(new Array(12).fill(0));
                }
            }
            if (encodingDict['melodyEncoded']) feature = feature.concat(getCircleOfThirds(note));
            if (encodingDict['duration']) feature = feature.concat(oneHot(parseInt(durations[i], 10), 48));
            if (encodingDict['chordsNormally']) {
                feature = feature.concat(chords[i]);
                if (i < notes.length - 1){
                    feature = feature.concat(chords[i + 1]);
                } else {
                    feature = feature.concat(new Array(12).fill(0));
                }
            }
            if (encodingDict['key']) feature = feature.concat(oneHot(parseInt(key, 10), 24));
            features.push(feature);
        }
        const featuresTensor = new tf.tensor2d(features);
        return featuresTensor;
    }


    async function getPrediction(input) {
        if (!modelLoaded) {
            modelfile = 'tfjs/modelwd1/model.json';
            model = await tf.loadLayersModel(modelfile);
            modelLoaded = true;
            console.log("loaded "+modelfile);
        }

        // const pitch = tf.tidy(() => {
        //     const output = model.predict(input);
        //     const pitch = output.argMax(axis = 1);
        //     return pitch.dataSync();
        // });

        const output = model.predict(input);
        const pitch = await output[0].argMax(axis = 1).data();
        const duration = await output[1].argMax(axis = 1).data();
        console.log("pitch", pitch);
        console.log("duration", duration);
        
        const sampled_pitch = pitch[0];
        const sampled_duration = duration[0];

        return [sampled_pitch, sampled_duration];
    }


    //HELPERS for getMelody
    function time_to_tick(time) {
        //zero indexed
        return Math.min(parseInt(time * TIMES, 10),TIMES) - 1;
    }

    function tick_to_time(tick) {
        //zero indexed
        return (tick+1) / TIMES * 4;
    }

    const major = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
    const minor = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];
    function rotate(arr, n){
        return arr.slice(n).concat(arr.slice(0,n));
    }
    function getChord(ch){
        if (ch < 12){
            return rotate(minor,12-ch);
        }
        else {
            ch = ch-12;
            return rotate(major,12-ch);
        }
    }


    let processrunning = false;
    async function getMelody(inputmelody, durations, chords, cdycallback) {
        if (processrunning) return;
        processrunning = true;

        let key = 0;
        let max_seq_len = 16; //otherwise too slow
        
        let notesnew = inputmelody.map(elt => elt[0] - LOW);
        let chordsnew = inputmelody.map(elt => getChord(chords[elt[1]-1]));

        notesnew = notesnew.slice(-max_seq_len);
        chordsnew = chordsnew.slice(-max_seq_len);
        let durationsnew = durations.map(x => time_to_tick(x));
        
        //dummy
        //let timesnew = new Array(notesnew.length).fill(11);

        console.log('notesnew',notesnew);
        console.log('chordsnew',chordsnew);
        console.log('durationsnew',durationsnew);

        console.time("predtime");
        let feat = getFeatureVectors(notesnew, durationsnew, chordsnew, key);
        let input = tf.expandDims(feat, 0);
        let pred = await getPrediction(input);
        console.log("pred",pred);
        let note = pred[0];
        let dur = tick_to_time(pred[1]);
        console.timeEnd("predtime");

        console.log("prednote "+note);  
        
        if (note == MELODY - 1) {
            note = "p";
        } else {
            note = note + LOW; // 0 -> 48 C
        };

        let improvisedMelody = [note, dur];

        cdymelody = wrap(improvisedMelody);

        api.evaluate(recreplace(cdycallback, {
            'm': cdymelody
        }));
        
        processrunning = false;
    };

    api.defineFunction("continueSequence", 4, function(args, modifs) {
        if (processrunning) {
            console.log("skip continueSequence, because process is already running");
            return api.nada;
        }

        let inputmelody = unwrap(api.evaluate(args[0]));
        let durations = unwrap(api.evaluate(args[1]));
        let chords = unwrap(api.evaluate(args[2]));

        console.log('inputmelody',inputmelody);
        getMelody(inputmelody, durations, chords, cloneExpression(args[3]));
        
        return api.nada;
    });


    api.defineFunction("getLanguage", 1,function(args,modifs) {
        let lang = window.navigator.userLanguage || window.navigator.language;
        console.log('language', lang); //works IE/SAFARI/CHROME/FF

        cdylang = wrap(lang);
        cdycallback = cloneExpression(args[0]);

        api.evaluate(recreplace(cdycallback, {
            'm': cdylang
        }));
    });
});