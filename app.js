(function () {
  'use strict';

  // Each language: how a line is split into syllables, the table that says how each part
  // sounds, the play button's voice, and the page's words. Vietnamese is keyed by spelling
  // (parse.js, data/SCHEMA.md); Burmese by sound (my-parse.js, tools/build_my_table.py).
  var LANGS = {
    vi: {
      title: '越南语发音',
      placeholder: '输入越南语，例如 xin chào',
      inputLang: 'vi',
      legend: '每个音节拆成几块，每块照那门语言读：黑字照拼音（ê 是「也 yě」里的 e），<span class="p-en">蓝字照英语（英式，aw 像 law）</span>，假名照日语，<span class="p-vn">橙字</span>是中英日没有现成写法的音，照写越南字母，听播放；\' 两边分开读；不带调号的 e 读轻声（像「的 de」）；调号跟拼音一样标在元音头上，ッ 是嗓子卡一下（照日语读）。',
      credit: '声音是语音合成，不是真人录音：Piper 越南语北部口音声音 vais1000（训练数据 VAIS-1000，CC BY 4.0），浏览器内生成。',
      tables: ['data/table.json'],
      tones: { ngang: '平声', huyen: '玄声', sac: '锐声', hoi: '问声', nga: '跌声', nang: '重声' },
      errors: {
        'two-tones': '一个音节只能有一个声调符号',
        'not-vietnamese': '越南语拼写里没有字母',
        'no-vowel': '这不是完整的音节（没有元音）',
        'tone-on-stop': '以 p / t / c / ch 结尾的音节只会是锐声或重声，拼写可能有误'
      },
      split: function (text) { return VietParse.splitText(text); },
      audio: function () { return window.VietAudio; },
      sizeMb: 63
    },
    my: {
      title: '缅甸语发音',
      placeholder: '输入缅甸文，例如 မင်္ဂလာပါ',
      inputLang: 'my',
      legend: '每个音节拆成几块，每块照那门语言读：黑字照拼音（ê 是「也 yě」里的 e），<span class="p-en">蓝字照英语（i 像 sit，oo 像 book，ow 像 now，aw 像 law，th 像 thin）</span>，假名照日语，<span class="p-vn">橙字</span>是中英日没有现成写法的音，照写缅甸字母，听播放；不带调号的 e 读轻声（像「的 de」）；调号跟拼音一样标在元音头上：ˉ 高平、ˇ 低平（像半个三声，只低不升）、ˋ 高降而短，ッ 是结尾嗓子一关，ン 是鼻音收尾（照日语读）。词典里有的词按词典读（会照实际读法变浊、弱读），没有的按拼写规则读；句子里 ပါ、တယ် 这类小词口语里常变浊（读 ba、de），以播放为准。',
      credit: '读音：词按 myG2P 2.0 词表（缅甸语言委员会词典，Ye Kyaw Thu 等，CC BY-NC-SA 4.0），音值按 Watkins 2001《国际语音学会会刊》。声音是语音合成，不是真人录音：Meta MMS 缅甸语声音 mms-tts-mya（CC BY-NC 4.0），浏览器内生成。',
      tables: ['data/my-table.json', 'data/my-dict.json'],
      tones: { low: '低调', high: '高调', creaky: '紧喉调', killed: '短促调', reduced: '弱读' },
      errors: {
        'not-burmese': '这里有缅甸文拼写里不会出现的写法',
        'unknown-rhyme': '拼写规则里没有这个韵母，可能是外来词或写错了'
      },
      split: function (text, data) { return MyParse.splitText(text, data[1]); },
      audio: function () { return window.MyAudio; },
      sizeMb: 58
    }
  };

  var q = document.getElementById('q');
  var out = document.getElementById('out');
  var status = document.getElementById('status');
  var astatus = document.getElementById('astatus');
  var DEBUG = new URL(location.href).searchParams.get('debug') === '1';
  var lang = null, L = null, table = null, data = [];
  var loaded = {};   // lang -> Promise of its tables

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setText(node, msg) {
    node.textContent = msg || '';
    node.hidden = !msg;
  }
  function showStatus(msg) { setText(status, msg); }
  // Audio messages (download progress, play result, play errors) have their own
  // line so they never hide the table notice.
  function showAudio(msg) { setText(astatus, msg); }

  // Small five-level pitch curve drawn from Chao digits ("214" → three points).
  function toneCurve(digits) {
    var d = String(digits).replace(/[^1-5]/g, '');
    if (!d) return null;
    if (d.length === 1) d += d;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 18');
    svg.setAttribute('class', 'curve');
    svg.setAttribute('aria-hidden', 'true');
    var pts = [];
    for (var i = 0; i < d.length; i++) {
      var x = 2 + (20 * i) / (d.length - 1);
      var y = 16 - (Number(d[i]) - 1) * 3.5;
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    var line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', pts.join(' '));
    svg.appendChild(line);
    return svg;
  }

  function lookupTone(s) {
    var t = table.tones || {};
    return t[s.toneKey] || t[s.tone] || null;
  }

  // Why a syllable has no reading, or null when it has one.
  function problem(s) {
    if (s.error) return L.errors[s.error] + (s.bad ? '「' + s.bad + '」' : '');
    var missing = [];
    if (!(table.initials || {})[s.initial]) missing.push('声母「' + (s.initial || '无') + '」');
    if (!(table.rhymes || {})[s.rhyme]) missing.push('韵母「' + s.rhyme + '」');
    if (!lookupTone(s)) missing.push('声调「' + L.tones[s.tone] + '」');
    if (missing.length) return '对照表里没有' + missing.join('、');
    return VietReading.read(s, table) ? null : '对照表里没有这个音节的拼音读法';
  }

  // The pieces of one syllable, each styled by the script it is read in (see the legend).
  function sayNode(pieces) {
    var w = el('span', 'say');
    pieces.forEach(function (p) {
      if (p.s === 'both') {
        var b = el('span', 'p-both');
        p.t.split('|').forEach(function (x) { b.appendChild(el('span', null, x)); });
        w.appendChild(b);
      } else {
        var n = el('span', 'p-' + p.s, p.t);
        if (p.s === 'my') n.lang = 'my';
        // a kana (or ê, whose hat a combining mark would sit on) has no tone mark of its own:
        // the pinyin mark is drawn over it by placeMarks() once the row is on the page
        if (p.mark) {
          n.classList.add('tm');
          n.setAttribute('data-t', p.mark);
          n.appendChild(el('i', 'bl'));
        }
        w.appendChild(n);
      }
    });
    return w;
  }

  // Tone marks over kana / ê, drawn as small lines (ˉ ˊ ˇ ˋ) just above the letter's own
  // ink, which is measured with canvas measureText (actualBoundingBoxAscent, MDN TextMetrics),
  // so the gap is the same whatever font the phone uses.
  var MARK_PATH = ['M0 50H100', 'M15 95L85 5', 'M0 5L50 95L100 5', 'M15 5L85 95'];
  var measure = document.createElement('canvas').getContext('2d');
  function placeMarks(root) {
    root.querySelectorAll('.tm').forEach(function (t) {
      var old = t.querySelector('.mk'); if (old) old.remove();
      var cs = getComputedStyle(t), fs = parseFloat(cs.fontSize);
      measure.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      var ink = measure.measureText(t.firstChild.nodeValue).actualBoundingBoxAscent;
      var base = t.querySelector('.bl').getBoundingClientRect().top - t.getBoundingClientRect().top;
      var h = 0.17 * fs, gap = 0.2 * fs;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'mk');
      svg.setAttribute('viewBox', '-10 -10 120 120');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.height = h + 'px';
      svg.style.top = (base - ink - gap - h) + 'px';
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', MARK_PATH[t.getAttribute('data-t') - 1]);
      svg.appendChild(path);
      t.appendChild(svg);
    });
  }

  function srcNode(s) {
    var n = el('span', 'vi', s.src);
    n.lang = L.inputLang;
    return n;
  }

  // One row: the written syllable, then its reading in pieces.
  function renderSyllable(s, r) {
    var row = el('div', 'syl');
    row.appendChild(srcNode(s));
    var rd = el('div', 'rd');
    row.appendChild(rd);
    if (!table) {
      // Table not loaded: show only the spelling split, clearly marked as such.
      rd.appendChild(el('span', 'raw', s.error ? L.errors[s.error] :
        (s.initial ? s.initial + ' + ' : '') + s.rhyme + ' · ' + L.tones[s.tone]));
      return row;
    }
    var bad = problem(s);
    if (bad) { row.classList.add('bad'); rd.appendChild(el('span', 'err', bad)); return row; }
    rd.appendChild(sayNode(r.say));
    // Burmese ည် read by the spelling rule: the word list has it as i, ɛ and e in different words
    if (s.how === 'rule' && /ည[့]?်/.test(s.src)) rd.appendChild(el('div', 'nb', 'ည် 在不同的词里读 i、ɛ 或 e，这里按最常见的 i'));
    return row;
  }

  // Burmese IPA with Watkins' tone marks: low none, high acute, creaky tilde below.
  function myIpa(s) {
    var on = s.initial, rh = s.rhyme;
    var mark = { high: '́', creaky: '̰' }[s.tone] || '';
    var v = rh.replace(/[ʔɴ]$/, ''), fin = rh.slice(v.length);
    return ((on ? on : 'ʔ') + v.charAt(0) + mark + v.slice(1) + fin).normalize('NFC');
  }

  // Expert view: IPA, Chao digits with the small curve, and sources.
  function renderPro(s) {
    var row = el('div', 'syl');
    row.appendChild(srcNode(s));
    var rd = el('div', 'rd');
    row.appendChild(rd);
    if (problem(s)) return row;
    var ini = table.initials[s.initial], rh = table.rhymes[s.rhyme], tn = lookupTone(s);
    var ipa = lang === 'my' ? myIpa(s) :
      (s.initial === '' && rh.zero != null ? '' : ini.kirby.slice(1, -1)) + rh.kirby.slice(1, -1);
    var top = el('div', 'top');
    top.appendChild(el('span', 'ipa', '[' + ipa + ']'));
    var tone = el('span', 'tone');
    if (tn.digits) tone.appendChild(el('span', 'digits', tn.digits));
    var c = toneCurve(tn.digits);
    if (c) tone.appendChild(c);
    top.appendChild(tone);
    if (tn.like) top.appendChild(el('span', 'inl', tn.like + (tn.text ? '，' + tn.text : '')));
    rd.appendChild(top);
    if (lang === 'my') {
      rd.appendChild(el('div', 'nb', '读音：' + (s.how === 'dict' ? '词表里的词「' + s.word + '」，' + table.src_dict
        : '词表里没有，按拼写规则：' + table.src_rules)));
    }
    rd.appendChild(el('div', 'nb', '声母：' + (ini.src || '缺出处')));
    rd.appendChild(el('div', 'nb', '韵母：' + (rh.src || '缺出处')));
    rd.appendChild(el('div', 'nb', '声调：' + (tn.src || '缺出处') + (tn.like_src ? '；对照：' + tn.like_src : '')));
    return row;
  }

  function playButton(label, onPlay) {
    var b = el('button', 'play', '▶');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var t0 = performance.now();
      onPlay().then(function (r) {
        // ?debug=1: show what played, for checking on devices without a console.
        if (DEBUG && r) showAudio('已播放 ' + r.duration.toFixed(2) + ' 秒，声音状态 ' + r.state + '，用时 ' + Math.round(performance.now() - t0) + ' 毫秒');
      }).catch(function (err) { showAudio('播放失败：' + (err && err.message || err)); });
    });
    return b;
  }

  function render() {
    var text = q.value.trim();
    out.textContent = '';
    if (text) {
      var syls = L.split(text, data);
      var card = el('div', 'phrase');
      var head = el('div', 'head');
      var audio = L.audio();
      if (audio && audio.available()) {
        head.appendChild(playButton('播放 ' + text, function () { return audio.playText(text); }));
      }
      if (table) {
        // the whole input read in one go, for reading it out as a sentence
        var line = el('p', 'line');
        syls.forEach(function (s, i) {
          var r = !problem(s) && VietReading.read(s, table);
          if (i) line.appendChild(document.createTextNode(' '));
          line.appendChild(r ? sayNode(r.say) : document.createTextNode('？'));
        });
        head.appendChild(line);
      }
      card.appendChild(head);
      var list = el('div', 'syls');
      var reads = table ? VietReading.readLine(syls, table) : [];
      syls.forEach(function (s, i) { list.appendChild(renderSyllable(s, reads[i])); });
      card.appendChild(list);
      if (table) {
        var pro = el('details', 'pro');
        pro.appendChild(el('summary', null, '专业标注（国际音标、五度调值、出处）'));
        var plist = el('div', 'syls');
        syls.forEach(function (s) { plist.appendChild(renderPro(s)); });
        pro.appendChild(plist);
        card.appendChild(pro);
      }
      out.appendChild(card);
      placeMarks(card);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeMarks(card); });
    }

    var url = new URL(location.href);
    if (text) url.searchParams.set('q', text); else url.searchParams.delete('q');
    if (lang === 'my') url.searchParams.set('lang', 'my'); else url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }

  // ?table=test/... loads a render-test fixture instead of the real Vietnamese table.
  function tablePaths(k) {
    var p = new URL(location.href).searchParams.get('table') || '';
    return k === 'vi' && /^test\/[\w-]+\.json$/.test(p) ? [p] : LANGS[k].tables;
  }

  function load(k) {
    if (!loaded[k]) {
      loaded[k] = Promise.all(tablePaths(k).map(function (path) {
        return fetch(path, { cache: 'no-cache' }).then(function (r) {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
      }));
      loaded[k].catch(function () { delete loaded[k]; });
    }
    return loaded[k];
  }

  function setLang(k) {
    lang = k; L = LANGS[k]; table = null; data = [];
    try { localStorage.setItem('lang', k); } catch (e) {}
    document.title = L.title;
    document.getElementById('title').textContent = L.title;
    document.getElementById('legend').innerHTML = L.legend;
    document.getElementById('credit').textContent = L.credit;
    q.placeholder = L.placeholder;
    q.lang = L.inputLang;
    document.querySelectorAll('#langs button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.value === k));
    });
    var audio = L.audio();
    if (audio && audio.setProgress) {
      audio.setProgress(function (f) {
        showAudio(f == null ? '' : '第一次播放要下载语音（' + L.sizeMb + ' MB，之后不用联网）：' + Math.round(f * 100) + '%');
      });
    }
    showStatus('');
    showAudio('');
    render();
    return load(k)
      .then(function (t) {
        if (lang !== k) return;
        data = t; table = t[0];
        if (!table) showStatus('对照表还没做好：下面只按拼写拆了声母、韵母和声调，还没有读法。');
      })
      .catch(function (err) {
        if (lang === k) showStatus('对照表读取失败：' + (err && err.message || err));
      })
      .then(function () { if (lang === k) render(); });
  }

  // Burmese letters typed or pasted while Vietnamese is on (or the other way) switch over.
  function guess(text) {
    if (/[က-႟]/.test(text)) return 'my';
    if (/[a-zA-Zà-ỹđĐ]/.test(text)) return 'vi';
    return null;
  }

  q.addEventListener('input', function () {
    var g = guess(q.value);
    if (g && g !== lang) setLang(g); else render();
  });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    q.blur();
  });
  document.querySelectorAll('#langs button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.value === lang) return;
      q.value = '';
      setLang(b.value);
      q.focus();
    });
  });

  var params = new URL(location.href).searchParams;
  q.value = params.get('q') || '';
  var start = guess(q.value) || params.get('lang');
  if (!LANGS[start]) { try { start = localStorage.getItem('lang'); } catch (e) { start = null; } }
  setLang(LANGS[start] ? start : 'vi');
})();
