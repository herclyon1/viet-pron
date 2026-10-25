// Burmese: split written text into syllables and say what each sounds like.
// Each syllable becomes onset + rhyme + tone in Watkins 2001 symbols (data/my-table.json says
// how each sound is written). The sound comes from the myG2P word list (data/my-dict.json)
// when the word is in it, because spelling does not show voicing, the weak [ə] or irregular
// words; otherwise from the spelling rules of the Wikipedia "Burmese alphabet" tables (A).
(function (root) {
  'use strict';

  // A, consonant letters: the onset each letter is read with (retroflex letters of Pali words
  // are read like the plain ones, A letter names [ta̰] [tʰa̰] [da̰] [na̰]).
  var BASE = {
    'က': 'k', 'ခ': 'kʰ', 'ဂ': 'g', 'ဃ': 'g', 'င': 'ŋ', 'စ': 's', 'ဆ': 'sʰ', 'ဇ': 'z', 'ဈ': 'z',
    'ည': 'ɲ', 'ဉ': 'ɲ', 'ဋ': 't', 'ဌ': 'tʰ', 'ဍ': 'd', 'ဎ': 'd', 'ဏ': 'n', 'တ': 't', 'ထ': 'tʰ',
    'ဒ': 'd', 'ဓ': 'd', 'န': 'n', 'ပ': 'p', 'ဖ': 'pʰ', 'ဗ': 'b', 'ဘ': 'b', 'မ': 'm', 'ယ': 'j',
    'ရ': 'j', 'လ': 'l', 'ဝ': 'w', 'သ': 'θ', 'ဟ': 'h', 'ဠ': 'l', 'အ': '', 'ဿ': 'θ'
  };
  // A, independent vowels = အ + the vowel sign (ဦ = ဥ + ီ)
  var INDEP = { 'ဣ': 'ိ', 'ဤ': 'ီ', 'ဥ': 'ု', 'ဦ': 'ူ', 'ဧ': 'ေ', 'ဩ': 'ော', 'ဪ': 'ော်' };
  var MED = { 'ျ': 'y', 'ြ': 'y', 'ွ': 'w', 'ှ': 'h' };
  var VSIGN = 'ါာိီုူေဲံ';
  var DOT = '့', VIS = 'း', ASAT = '်', STACK = '္';

  function isCons(c) { return BASE.hasOwnProperty(c); }
  function isStart(c) { return isCons(c) || INDEP.hasOwnProperty(c); }

  // One run of Burmese letters -> written syllables. A consonant followed by asat (်) or by
  // the stacking sign (္) closes the syllable before it (A "Consonant stacking"; kinzi င်္ too).
  // raw = the letters as typed (for the word list), text = as shown (a stacked final with asat).
  function syllables(run) {
    var cs = Array.from(run), out = [], cur = null;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], n = cs[i + 1], n2 = cs[i + 2];
      if (c === 'ဿ' && cur) {                    // ဿ = သ္သ: final သ, then a new syllable on သ
        cur.raw += c; cur.text += 'သ်'; cur.fin = 'သ'; out.push(cur);
        cur = { raw: '', text: 'သ', start: 'သ' }; continue;
      }
      var closes = isCons(c) && cur && (n === ASAT || n === STACK || (n === DOT && n2 === ASAT));
      if (isStart(c) && !closes) {
        if (cur) out.push(cur);
        cur = { raw: c, text: c, start: c };
        continue;
      }
      if (!cur) return null;                     // a sign with no letter before it
      cur.raw += c;
      if (c !== STACK) cur.text += c;
      if (closes) {
        cur.fin = c;
        if (n === STACK) { cur.raw += STACK; cur.text += ASAT; i++; }   // မန္တ -> မန် + တ
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  var VOWEL = { '': 'a', 'ာ': 'a', 'ိ': 'i', 'ီ': 'i', 'ု': 'u', 'ူ': 'u', 'ေ': 'e', 'ဲ': 'ɛ', 'ာေ': 'ɔ', 'ို': 'o' };
  // inherent tone of an open syllable (A open-syllable table): creaky with no sign, ိ, ု;
  // high with ဲ, ော; low otherwise (ော် ယ် ည် low too); ့ makes it creaky, း high
  var OPEN_TONE = { '': 'creaky', 'ိ': 'creaky', 'ု': 'creaky', 'ဲ': 'high', 'ာေ': 'high' };
  var STOP = { 'က': { '': 'ɛ', 'ာေ': 'aʊ', 'ို': 'aɪ' }, 'စ': { '': 'ɪ' } };
  var NAS = { 'င': { '': 'ɪ', 'ာေ': 'aʊ', 'ို': 'aɪ' }, 'ဉ': { '': 'ɪ' } };
  var OTHER = { '': 'a', 'ာ': 'a', 'ိ': 'eɪ', 'ု': 'oʊ' };   // after တ ပ န မ ံ and Pali finals

  // Written syllable -> sound by the spelling rules (A three rhyme tables).
  function rule(sy) {
    var t = sy.raw, start = sy.start, fin = sy.fin || '';
    var cs = Array.from(t), finAt = fin ? cs.lastIndexOf(fin) : -1;
    var signs = [], med = {}, asatV = false, anu = false;
    var dot = t.indexOf(DOT) >= 0, vis = t.indexOf(VIS) >= 0;
    if (INDEP[start]) {
      Array.from(INDEP[start]).forEach(function (c) { if (c === ASAT) asatV = true; else signs.push(c); });
    }
    cs.forEach(function (c, i) {
      if (i === 0 || i === finAt || (finAt >= 0 && i > finAt)) return;
      if (MED[c]) med[MED[c]] = true;
      else if (c === 'ံ') anu = true;
      else if (VSIGN.indexOf(c) >= 0) signs.push(c === 'ါ' ? 'ာ' : c);
      else if (c === ASAT) asatV = true;                       // ော် : asat on a vowel = low tone
    });
    var vkey = signs.sort().join('');
    // ယ် is the vowel ɛ, ည် mostly i (myG2P: i 763, ɛ 607, e 249 times; A lists i and ɛ);
    // ိုယ် ိုလ် ိုဟ် are ို [o] (myG2P ကိုယ် ko, ဗိုလ် bo, ဂြိုဟ် dʒo)
    var yfin = fin === 'ယ' && vkey !== 'ို', nyfin = fin === 'ည';
    if (vkey === 'ို' && /^[ယလဟ]$/.test(fin)) fin = '';
    if (yfin || nyfin) fin = '';
    // onset (A consonant letters and medials)
    var c = INDEP[start] ? '' : BASE[start], on = c;
    if (med.h) {
      on = { m: 'm̥', n: 'n̥', 'ɲ': 'ɲ̊', 'ŋ': 'ŋ̊', l: 'ɬ', w: 'ʍ', j: 'ʃ' }[c] || c;
      if (med.y && (c === 'θ' || c === 'l')) on = 'ʃ';          // သျှ လျှ = ʃ
      else if (med.y && on !== 'ʃ') on += 'j';                  // မျှ = m̥j
    } else if (med.y) {
      // စျ is another spelling of ဈ [z] (myG2P စျေး zé)
      on = { k: 'tʃ', 'kʰ': 'tʃʰ', g: 'dʒ', 'ŋ': 'ɲ', s: 'z' }[c] || c + 'j';
      if (c === 'm' && med.w) on = 'm';                          // မြွ = mw (myG2P mw 42, mjw 6)
    }
    var w = !!med.w, rh, tone;
    if (!fin && !anu) {
      rh = yfin ? 'ɛ' : nyfin ? 'i' : VOWEL[vkey];
      if (rh == null) return { error: 'unknown-rhyme' };
      var base = yfin || nyfin || asatV ? 'low' : OPEN_TONE[vkey] || 'low';
      tone = dot ? 'creaky' : vis ? 'high' : base;
    } else {
      var stop = !anu && /^[ကစတပဋဌဍဎဒဓထဖဗဘဇဈခဂဃသ]$/.test(fin);
      var tab = (stop ? STOP : NAS)[fin] || OTHER;
      rh = tab[vkey] || OTHER[vkey];
      // ွ before တ ပ န မ ံ is the vowel ʊ, not w (A: ကွတ် [kʊʔ], ကွန် [kʊɰ̃]); so is the letter
      // ဝ itself except before မ် (myG2P ဝတ် wʊʔ, ဝန် wʊɴ, ဝံ wʊɴ, but ဝမ်း wáɴ)
      if (vkey === '' && tab === OTHER && (w || c === 'w' && fin !== 'မ')) { rh = 'ʊ'; w = false; }
      // ေ before a stop in loanwords is ɪ (A: မေတ္တာ; myG2P ခေတ် kʰɪʔ); ာ before ဉ် is ɪ (ယာဉ် jɪɴ)
      if (stop && vkey === 'ေ') rh = 'ɪ';
      if (fin === 'ဉ' && vkey === 'ာ') rh = 'ɪ';
      if (!rh) return { error: 'unknown-rhyme' };
      rh += stop ? 'ʔ' : 'ɴ';
      tone = stop ? 'killed' : dot ? 'creaky' : vis ? 'high' : 'low';
    }
    if (w) on += 'w';
    return { onset: on, rhyme: rh, tone: tone, how: 'rule' };
  }

  // Split a line: Burmese runs into syllables; spaces, Burmese punctuation (၊ ။) and other
  // scripts separate. Words are looked up longest first in the word list.
  function splitText(text, dict) {
    var clean = text.normalize('NFC').replace(/[​‌‍﻿]/g, '');
    var runs = clean.split(/[^က-ဿ]+/), out = [];
    var words = (dict && dict.words) || {};
    runs.forEach(function (run) {
      if (!run) return;
      var sy = syllables(run);
      if (!sy) { out.push({ src: run, error: 'not-burmese' }); return; }
      var i = 0;
      while (i < sy.length) {
        var hit = null;
        for (var j = Math.min(sy.length, i + 12); j > i && !hit; j--) {
          var w = sy.slice(i, j).map(function (s) { return s.raw; }).join('');
          var ipa = words[w];
          if (ipa && ipa.split(' ').length === j - i) hit = { j: j, word: w, ipa: ipa.split(' ') };
        }
        if (hit) {
          for (var k = i; k < hit.j; k++) {
            var p = hit.ipa[k - i].split('|');
            out.push(make(sy[k], { onset: p[0], rhyme: p[1], tone: p[2], how: 'dict', word: hit.word }));
          }
          i = hit.j;
        } else {
          out.push(make(sy[i], rule(sy[i])));
          i++;
        }
      }
    });
    return out;
  }

  function make(sy, r) {
    if (r.error) return { src: sy.text, error: r.error };
    // reading.js reads say[initial|rhyme] and tones[toneKey], as for Vietnamese
    return { src: sy.text, initial: r.onset, rhyme: r.rhyme, tone: r.tone, toneKey: r.tone,
             how: r.how, word: r.word || '' };
  }

  root.MyParse = { syllables: syllables, rule: rule, splitText: splitText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
