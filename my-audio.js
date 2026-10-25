// Speech for the Burmese play buttons: Meta MMS-TTS Burmese voice facebook/mms-tts-mya
// (VITS, CC BY-NC 4.0), exported to ONNX with its weights stored as float16
// (sources/burmese/tts/export_onnx.py, fp16_weights.py: the same waveform as float32 to
// correlation 0.9999), run in the browser by onnxruntime-web 1.20.1 (MIT, WebAssembly).
// First use downloads the model (57.9 MB) into the browser's Cache Storage; later plays
// are offline. Text goes in as the model's own letters (VitsTokenizer: lower-case, drop
// letters it has no id for, a blank id 0 between letters).
(function (root) {
  'use strict';

  var ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  var MODEL = 'models/mms-tts-mya/model_fp16.onnx';
  var VOCAB = 'models/mms-tts-mya/vocab.json';
  var SIZE = 57869163, RATE = 16000, CACHE = 'mms-tts-mya-1';

  var ready = null;
  var ctx = null;
  var cache = new Map(); // text -> Promise<AudioBuffer>
  var onProgress = function () {};

  function script(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = function () { fail(new Error('语音程序下载失败')); };
      document.head.appendChild(s);
    });
  }

  // The model, from Cache Storage when it is there, else downloaded once with progress.
  function modelBytes() {
    var store = root.caches ? root.caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null);
    return store.then(function (c) {
      return (c ? c.match(MODEL) : Promise.resolve(null)).then(function (hit) {
        if (hit) return hit.arrayBuffer();
        return fetch(MODEL).then(function (r) {
          if (!r.ok) throw new Error('语音下载失败 HTTP ' + r.status);
          var total = Number(r.headers.get('content-length')) || SIZE, got = 0, parts = [];
          var rd = r.body.getReader();
          function pump() {
            return rd.read().then(function (x) {
              if (x.done) return;
              parts.push(x.value); got += x.value.length; onProgress(Math.min(1, got / total));
              return pump();
            });
          }
          return pump().then(function () {
            var buf = new Uint8Array(got), o = 0;
            parts.forEach(function (p) { buf.set(p, o); o += p.length; });
            if (c) c.put(MODEL, new Response(buf.slice())).catch(function () {});
            return buf.buffer;
          });
        });
      });
    });
  }

  function load() {
    if (!ready) {
      ready = Promise.all([
        script(ORT + 'ort.wasm.min.js'),
        fetch(VOCAB).then(function (r) { return r.json(); }),
        modelBytes()
      ]).then(function (x) {
        var ort = root.ort;
        ort.env.wasm.wasmPaths = ORT;
        ort.env.wasm.numThreads = 1;          // GitHub Pages is not cross-origin isolated
        return ort.InferenceSession.create(new Uint8Array(x[2]), { executionProviders: ['wasm'] })
          .then(function (s) { return { ort: ort, vocab: x[1], session: s }; });
      });
      ready.catch(function () { ready = null; });
    }
    return ready;
  }

  function ids(text, vocab) {
    var kept = Array.from(text.toLowerCase()).filter(function (c) { return vocab.hasOwnProperty(c); }).join('').trim();
    var out = [0];
    Array.from(kept).forEach(function (c) { out.push(vocab[c], 0); });
    return out;
  }

  // iOS only lets audio start inside a tap; create and resume the context synchronously.
  function unlock() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function toBuffer(wave) {
    try {
      var b = ctx.createBuffer(1, wave.length, RATE);
      b.getChannelData(0).set(wave);
      return b;
    } catch (e) {                               // a browser without 16 kHz buffers: resample
      var n = Math.round(wave.length * ctx.sampleRate / RATE), b2 = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = b2.getChannelData(0);
      for (var i = 0; i < n; i++) {
        var x = i * RATE / ctx.sampleRate, k = Math.floor(x), f = x - k;
        d[i] = (wave[k] || 0) * (1 - f) + (wave[k + 1] || 0) * f;
      }
      return b2;
    }
  }

  function synth(text) {
    if (cache.has(text)) return cache.get(text);
    var p = load().then(function (m) {
      var t = ids(text, m.vocab);
      if (t.length < 3) throw new Error('没有能读的缅甸文');
      var n = t.length;
      var feeds = {
        input_ids: new m.ort.Tensor('int64', BigInt64Array.from(t.map(BigInt)), [1, n]),
        attention_mask: new m.ort.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n])
      };
      return m.session.run(feeds);
    }).then(function (out) { return toBuffer(out.waveform.data); });
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

  root.MyAudio = {
    available: function () { return !!(root.AudioContext || root.webkitAudioContext) && !!root.WebAssembly && typeof BigInt64Array !== 'undefined'; },
    playText: play,
    // fn(fraction 0..1) while the model downloads, fn(null) when done.
    setProgress: function (fn) { onProgress = fn; },
    SIZE_MB: (SIZE / 1e6).toFixed(0)
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
