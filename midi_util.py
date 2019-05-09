from mido import MidiFile, MidiTrack, Message, MetaMessage
import mido
import glob
import numpy as np
from pathlib import Path
#from mido.midifiles.meta import MetaMessage

def getNoteRangeAndTicks(files_dir, resolution=8):
    ticks = []
    notes = []
    
    for file_dir in files_dir:
        file_path = "%s" %(file_dir)
    
        mid = MidiFile(file_path)

        for track in mid.tracks: #preprocessing: Checking range of notes and total number of ticks
            num_ticks = 0           
            for message in track:
                if not isinstance(message, MetaMessage):
                    notes.append(message.note)
                    num_ticks += int(message.time)
            ticks.append(num_ticks)
                    
    return min(notes), max(notes), int(max(ticks)/mid.ticks_per_beat*resolution)



def fromMidiCreatePianoRoll(files_dir, ticks, lowest_note, highest_note, resolution=8):
    num_files = len(files_dir)        
    
    piano_roll = np.zeros((num_files, ticks, highest_note-lowest_note+1), dtype=np.float32)
    
    for i, file_dir in enumerate(files_dir):
        file_path = "%s" %(file_dir)
        mid = MidiFile(file_path)
        note_time_onoff = getNoteTimeOnOffArray(mid)
        note_on_length = getNoteOnLengthArray(note_time_onoff)
        for (note, start, length) in note_on_length:
            start = int(start/mid.ticks_per_beat*8)
            length = int(length/mid.ticks_per_beat*8)
            piano_roll[i, start:(start+int(np.ceil(length/2))), note-lowest_note] = 1
    
    return piano_roll

def getNoteTimeOnOffArray(mid):
    
    note_time_onoff_array = []  
    
    for track in mid.tracks:
        current_time = 0
        for message in track:
            if not isinstance(message, MetaMessage):
                current_time += int(message.time)
                if message.type == 'note_on':
                    note_onoff = 1
                elif message.type == 'note_off':
                    note_onoff = 0
                else:
                    print("Error: Note Type not recognized!")
                    
                note_time_onoff_array.append([message.note, current_time, note_onoff])
                
    return note_time_onoff_array

def getNoteOnLengthArray(note_time_onoff_array):
    note_on_length_array = []
    for i, message in enumerate(note_time_onoff_array):
        if message[2] == 1: #if note type is 'note_on'
            start_time = message[1]
            for event in note_time_onoff_array[i:]: #go through array and look for, when the current note is getting turned off
                if event[0] == message[0] and event[2] == 0:
                    length = event[1] - start_time
                    break
                
            note_on_length_array.append([message[0], start_time, length])
            
    return note_on_length_array



def createNetInputs(roll, target, seq_length=64, step_size=2):
    # 8 ticks per bar -> 8 bars -> 64 seq_length, 4 step/bar (4 notes/bar) -> step_size=2
    X = []
    y = []
    
    for i, song in enumerate(roll):
        pos = 0
        while pos + seq_length < song.shape[0]:
            sequence = np.array(song[pos:pos+seq_length])
            X.append(sequence)
            y.append(target[i, pos+seq_length])
            pos += step_size
 
    return np.array(X), np.array(y)


def NetOutToPianoRoll(network_output, threshold=0.1):
    piano_roll = []
    for i, timestep in enumerate(network_output):
        if np.amax(timestep) > threshold:
            pos = 0
            pos = np.argmax(timestep)
            timestep[:] = np.zeros(timestep.shape)
            timestep[pos] = 1
        else:
            timestep[:] = np.zeros(timestep.shape)
        piano_roll.append(timestep)
        
    return np.array(piano_roll)


def createMidiFromPianoRoll(piano_roll, lowest_note, directory, filename, tempo=120, threshold=0.1, resolution=8):
    
    ticks_per_beat = resolution
    mid = MidiFile(type=0, ticks_per_beat=ticks_per_beat)
    track = MidiTrack()
    mid.tracks.append(track)
    track.append(MetaMessage('set_tempo', tempo=mido.bpm2tempo(tempo), time=0))
    
    delta_times = [0]
    for k in range(piano_roll.shape[1]): #initial starting values
        if piano_roll[0, k] == 1:
            track.append(Message('note_on', note=k+lowest_note, velocity=100, time=0))
            delta_times.append(0)
        
    for j in range(piano_roll.shape[0]-1): #all values between first and last one
        set_note = 0 #Check, if for the current timestep a note has already been changed (set to note_on or note_off)
        
        for k in range(piano_roll.shape[1]):
            if (piano_roll[j+1, k] == 1 and piano_roll[j, k] == 0) \
            or (piano_roll[j+1, k] == 0 and piano_roll[j, k] == 1): #only do something if note_on or note_off are to be set
                if set_note == 0:
                    time = j+1 - sum(delta_times)          
                    delta_times.append(time)
                else:
                    time = 0
                    
                if piano_roll[j+1, k] == 1 and piano_roll[j, k] == 0:
                    set_note += 1
                    track.append(Message('note_on', note=k+lowest_note, velocity=100, time=time))
                if piano_roll[j+1, k] == 0 and piano_roll[j, k] == 1:
                    set_note += 1
                    track.append(Message('note_off', note=k+lowest_note, velocity=64, time=time))
                           
    filepath = Path(directory) / (filename + '.mid')
    mid.save(filepath)
       
    return
