// Vietnamese orthographic syllable splitter.
// Splits each written syllable into initial + rhyme + tone, using the
// spelling rules of Quốc ngữ only. It does not decide how anything sounds:
// the sound of each part comes from data/table.json (see data/SCHEMA.md).
(function (root) {
  'use strict';

  // Combining tone marks after NFD. Other combining marks (circumflex U+0302,
  // breve U+0306, horn U+031B) are part of the vowel letter, not the tone.
  var TONE_MARKS = {
    '́': 'sac',   // sắc  á
    '̀': 'huyen', // huyền à
    '̉': 'hoi',   // hỏi  ả
    '̃': 'nga',   // ngã  ã
    '̣': 'nang'   // nặng ạ
  };

  // Longest first so "ngh" wins over "ng" and "ng" over "n".
  var INITIALS = ['ngh', 'ng', 'gh', 'gi', 'kh', 'nh', 'ph', 'th', 'tr', 'ch', 'qu',
    'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];

  var VOWELS = 'aăâeêioôơuưy';
  var LETTERS = 'abcdđeêghiklmnoôơpqrstuưvxyăâ';
  var STOP_CODAS = ['ch', 'c', 'p', 't'];

  function isVowel(ch) { return VOWELS.indexOf(ch) >= 0; }

  // Split one written syllable. Returns
  // { src, base, initial, rhyme, tone, toneKey, stop } or { src, error }.
  function splitSyllable(src) {
    var nfd = src.normalize('NFD').toLowerCase();
    var tone = 'ngang';
    var toneCount = 0;
    var stripped = '';
    for (var i = 0; i < nfd.length; i++) {
      var ch = nfd[i];
      if (TONE_MARKS[ch]) { tone = TONE_MARKS[ch]; toneCount++; } else { stripped += ch; }
    }
    var base = stripped.normalize('NFC');
    if (toneCount > 1) return { src: src, error: 'two-tones' };
    for (var j = 0; j < base.length; j++) {
      if (LETTERS.indexOf(base[j]) < 0) return { src: src, error: 'not-vietnamese', bad: base[j] };
    }

    var initial = '';
    for (var k = 0; k < INITIALS.length; k++) {
      if (base.indexOf(INITIALS[k]) === 0) { initial = INITIALS[k]; break; }
    }
    var rhyme = base.slice(initial.length);

    // "gi" before a consonant or at the end keeps its i as the vowel:
    // gì = gi + i, gìn = gi + in.
    if (initial === 'gi' && (rhyme === '' || !isVowel(rhyme[0]))) rhyme = 'i' + rhyme;
    // gi + iê drops one i in writing: giếng = gi + iêng, giết = gi + iêt.
    else if (initial === 'gi' && rhyme[0] === 'ê') rhyme = 'i' + rhyme;
    // "qu" needs a vowel after it; "qu" alone is not a syllable.
    if (!rhyme || !/[aăâeêioôơuưy]/.test(rhyme)) return { src: src, error: 'no-vowel' };

    var stop = STOP_CODAS.some(function (c) { return rhyme.slice(-c.length) === c; });
    // Only sắc and nặng occur on syllables closed by p / t / c / ch.
    if (stop && tone !== 'sac' && tone !== 'nang') return { src: src, error: 'tone-on-stop' };
    var toneKey = stop ? tone + '_stop' : tone;

    return { src: src, base: base, initial: initial, rhyme: rhyme, tone: tone, toneKey: toneKey, stop: stop };
  }

  // Split a whole input line into syllables. Vietnamese writes one syllable
  // per space-separated chunk; hyphens and punctuation are separators too.
  function splitText(text) {
    var parts = text.normalize('NFC').split(/[^\p{L}\p{M}]+/u);
    var out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(splitSyllable(parts[i]));
    return out;
  }

  root.VietParse = { splitSyllable: splitSyllable, splitText: splitText, TONE_MARKS: TONE_MARKS, INITIALS: INITIALS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
