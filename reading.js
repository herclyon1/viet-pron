// Default reading of one parsed syllable: pinyin letters + a Mandarin tone mark, plus
// short Chinese notes. Every letter and note comes from data/table.json (py fields);
// this file only joins them and places the tone mark by the pinyin rule.
(function (root) {
  'use strict';

  var MARKS = {
    a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
    'ê': ['ê̄', 'ế', 'ê̌', 'ề']
  };

  // Pinyin rule: a, else e / ê, else o, else the last of i u ü.
  function toneIndex(py) {
    var i = py.indexOf('a');
    if (i < 0) i = py.search(/[eê]/);
    if (i < 0) i = py.indexOf('o');
    if (i < 0) {
      for (var k = py.length - 1; k >= 0; k--) if ('iuü'.indexOf(py[k]) >= 0) { i = k; break; }
    }
    return i;
  }

  function placeTone(py, n) {
    var i = toneIndex(py);
    if (i < 0 || !(n >= 1 && n <= 4)) return py;
    var m = MARKS[py[i]];
    return py.slice(0, i) + m[n - 1] + py.slice(i + 1);
  }

  // s: one VietParse syllable; t: the table. Returns null when a part is missing.
  function read(s, t) {
    var ini = (t.initials || {})[s.initial];
    var rh = (t.rhymes || {})[s.rhyme];
    var tn = (t.tones || {})[s.toneKey] || (t.tones || {})[s.tone];
    if (!ini || !rh || !tn || rh.py == null || ini.py == null || tn.mand == null) return null;
    var rpy = s.initial === '' ? rh.py0 : rh.py;
    var front = /^[iü]/.test(rh.py);  // the rhyme starts with an i / ü sound
    var py = (front ? ini.py_i : ini.py) + rpy;
    var inline = [];
    if (rh.short && !/短/.test(tn.note || '')) inline.push('短');
    if (tn.note) inline.push(tn.note);
    var below = [];
    var inote = front ? ini.note_i : ini.note;
    if (inote) below.push(inote);
    if (rh.note) below.push(rh.note);
    return { py: placeTone(py, tn.mand), inline: inline.join('，'), below: below, stop: rh.stop || '' };
  }

  // A whole input: read() for each syllable, with the coda-stop note (p / t / c / ch)
  // added under the first syllable that ends that way only. null where read() is null.
  function readLine(syls, t) {
    var seen = {};
    return syls.map(function (s) {
      var r = read(s, t);
      if (r && r.stop && !seen[r.stop]) { seen[r.stop] = true; r.below.push(r.stop); }
      return r;
    });
  }

  root.VietReading = { read: read, readLine: readLine, placeTone: placeTone };
})(typeof window !== 'undefined' ? window : globalThis);
