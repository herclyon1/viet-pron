// Default reading of one parsed syllable: a list of pieces, each written in the script that
// has its sound (py pinyin, en English, ja Japanese kana, vn the Vietnamese letter for a sound
// none of the three has, small = only the consonant of a kana, both = two sounds at once).
// The piece flagged as the main vowel carries the Mandarin tone mark, as in pinyin: a letter
// takes it as a combining mark (ā á ǎ à), a kana gets it drawn above (piece.mark). The
// glottal catch of nặng / ngã is a Japanese ッ. Every piece comes from data/table.json.
(function (root) {
  'use strict';

  var COMB = ['̄', '́', '̌', '̀'];

  // Pinyin rule for which letter takes the mark: a, else e / ê, else o, else the last i / u.
  function markLetter(text, n) {
    var i = text.indexOf('a');
    if (i < 0) i = text.search(/[eê]/);
    if (i < 0) i = text.indexOf('o');
    if (i < 0) for (var k = text.length - 1; k >= 0; k--) if ('iu'.indexOf(text[k]) >= 0) { i = k; break; }
    if (i < 0) return null;
    return (text.slice(0, i + 1) + COMB[n - 1] + text.slice(i + 1)).normalize('NFC');
  }

  // s: one VietParse syllable; t: the table. Returns null when a part is missing.
  function read(s, t) {
    var say = (t.say || {})[s.initial + '|' + s.rhyme];
    var tn = (t.tones || {})[s.toneKey] || (t.tones || {})[s.tone];
    if (!say || !tn || !tn.mark) return null;
    var out = [], placed = false;
    say.forEach(function (p) {
      var q = { s: p[0], t: p[1] };
      if (p[2] && !placed) {
        placed = true;
        var m = (q.s === 'py' || q.s === 'en') && markLetter(q.t, tn.mark);
        if (m) q.t = m; else q.mark = tn.mark;
        out.push(q);
        if (tn.catch === 'mid') out.push({ s: 'ja', t: 'ッ' });
        return;
      }
      out.push(q);
    });
    if (!placed) return null;
    if (tn.catch === 'end') out.push({ s: 'ja', t: 'ッ' });
    return { say: out, text: toText(out) };
  }

  var MARKS = ['ˉ', 'ˊ', 'ˇ', 'ˋ'];
  // Plain-text form (tests): both = a/b, small kana in ( ), a kana's tone mark after it.
  function toText(pieces) {
    return pieces.map(function (p) {
      if (p.s === 'both') return p.t.replace('|', '/');
      if (p.s === 'small') return '(' + p.t + ')';
      return p.t + (p.mark ? MARKS[p.mark - 1] : '');
    }).join('');
  }

  function readLine(syls, t) {
    return syls.map(function (s) { return read(s, t); });
  }

  root.VietReading = { read: read, readLine: readLine, toText: toText, markLetter: markLetter };
})(typeof window !== 'undefined' ? window : globalThis);
