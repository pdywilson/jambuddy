# LSTM-based melody generation

Test out the application [here](pdywilson.github.io/jambuddy.html).

## Usage

The implementation can be found in the Jupyter-Notebook file [JamBuddy.ipynb](https://github.com/pdywilson/jambuddy/blob/master/JamBuddy.ipynb). 
The model is implemented in [Tensorflow Keras](https://www.tensorflow.org/guide/keras). The preprocessing pipeline can convert files of the formats MusicXML and MIDI to the encoding.


## Credits

The preprocessing pipeline uses the library [music21](https://web.mit.edu/music21/) and the evaluation is inspired by the [JazzGAN paper](https://www.researchgate.net/publication/327043643_JazzGAN_Improvising_with_Generative_Adversarial_Networks).

The MIDI Beatles dataset is based on “Pop Classics For Piano: The Very Best Of The Beatles - Easy Arrangements for Piano” by Hans-Günter Heumann and was converted to the MIDI format in https://github.com/konstilackner/LSTM-RNN-Melody-Composer.
