// Speech for the play buttons: Piper voice vi_VN-vais1000-medium run in the
// browser by @diffusionstudio/vits-web 1.0.3 (MIT). The voice is trained on
// VAIS-1000 ("Vietnamese northern accent", CC BY 4.0, per the Piper model card).
// Source survey: ~/Money/styl-work/BOARD/越南语发音-原声来源-0924.md.
// First use downloads the model (63.2 MB) into the browser's private file
// storage; later plays are offline.
(function (root) {
  'use strict';

  var LIB = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm';
  var VOICE = 'vi_VN-vais1000-medium';

  var lib = null;
  var ctx = null;
  var cache = new Map(); // text -> Promise<AudioBuffer>
  var onProgress = function () {};

  function loadLib() {
    if (!lib) lib = import(LIB).catch(function (e) { lib = null; throw e; });
    return lib;
  }

  // iOS only lets audio start inside a tap; create and resume the context
  // synchronously in the click handler, before any await.
  function unlock() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function synth(text) {
    if (cache.has(text)) return cache.get(text);
    var p = loadLib()
      .then(function (tts) {
        return tts.predict({ text: text, voiceId: VOICE }, function (e) {
          if (e && e.total) onProgress(e.loaded / e.total);
        });
      })
      .then(function (wav) { return wav.arrayBuffer(); })
      .then(function (buf) { return ctx.decodeAudioData(buf); });
    p.catch(function () { cache.delete(text); });
    cache.set(text, p);
    return p;
  }

  function play(text) {
    unlock();
    return synth(text).then(function (buffer) {
      onProgress(null);
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
      return { duration: buffer.duration, state: ctx.state };
    }, function (e) { onProgress(null); throw e; });
  }

  root.VietAudio = {
    available: function () { return !!(root.AudioContext || root.webkitAudioContext) && !!(navigator.storage && navigator.storage.getDirectory); },
    playText: play,
    playSample: play,
    // fn(fraction 0..1) while the model downloads, fn(null) when done.
    setProgress: function (fn) { onProgress = fn; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
