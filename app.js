(function () {
  'use strict';

  var TONE_NAMES = { ngang: '平声', huyen: '玄声', sac: '锐声', hoi: '问声', nga: '跌声', nang: '重声' };
  var ERRORS = {
    'two-tones': '一个音节只能有一个声调符号',
    'not-vietnamese': '越南语拼写里没有字母',
    'no-vowel': '这不是完整的音节（没有元音）',
    'tone-on-stop': '以 p / t / c / ch 结尾的音节只会是锐声或重声，拼写可能有误'
  };

  var q = document.getElementById('q');
  var out = document.getElementById('out');
  var status = document.getElementById('status');
  var astatus = document.getElementById('astatus');
  var table = null;
  var DEBUG = new URL(location.href).searchParams.get('debug') === '1';

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
    if (s.error) return ERRORS[s.error] + (s.bad ? '「' + s.bad + '」' : '');
    var missing = [];
    if (!(table.initials || {})[s.initial]) missing.push('声母「' + (s.initial || '无') + '」');
    if (!(table.rhymes || {})[s.rhyme]) missing.push('韵母「' + s.rhyme + '」');
    if (!lookupTone(s)) missing.push('声调「' + TONE_NAMES[s.tone] + '」');
    if (missing.length) return '对照表里没有' + missing.join('、');
    return VietReading.read(s, table) ? null : '对照表里没有这个音节的拼音读法';
  }

  // One row: Vietnamese spelling, then the pinyin reading with its notes.
  function renderSyllable(s, r) {
    var row = el('div', 'syl');
    row.appendChild(el('span', 'vi', s.src));
    var rd = el('div', 'rd');
    row.appendChild(rd);
    if (!table) {
      // Table not loaded: show only the spelling split, clearly marked as such.
      rd.appendChild(el('span', 'raw', s.error ? ERRORS[s.error] :
        (s.initial ? s.initial + ' + ' : '') + s.rhyme + ' · ' + TONE_NAMES[s.tone]));
      return row;
    }
    var bad = problem(s);
    if (bad) { row.classList.add('bad'); rd.appendChild(el('span', 'err', bad)); return row; }
    var top = el('div', 'top');
    top.appendChild(el('span', 'py', r.py));
    if (r.inline) top.appendChild(el('span', 'inl', r.inline));
    rd.appendChild(top);
    r.below.forEach(function (n) { rd.appendChild(el('div', 'nb', n)); });
    return row;
  }

  // Expert view: Kirby 2011 IPA, Chao digits with the small curve, and sources.
  function renderPro(s) {
    var row = el('div', 'syl');
    row.appendChild(el('span', 'vi', s.src));
    var rd = el('div', 'rd');
    row.appendChild(rd);
    if (problem(s)) return row;
    var ini = table.initials[s.initial], rh = table.rhymes[s.rhyme], tn = lookupTone(s);
    var zero = s.initial === '' && rh.zero != null;
    var ipa = (zero ? '' : ini.kirby.slice(1, -1)) + rh.kirby.slice(1, -1);
    var top = el('div', 'top');
    top.appendChild(el('span', 'ipa', '[' + ipa + ']'));
    var tone = el('span', 'tone');
    tone.appendChild(el('span', 'digits', tn.digits));
    var c = toneCurve(tn.digits);
    if (c) tone.appendChild(c);
    top.appendChild(tone);
    if (tn.like) top.appendChild(el('span', 'inl', tn.like + (tn.text ? '，' + tn.text : '')));
    rd.appendChild(top);
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
      var syls = VietParse.splitText(text);
      var card = el('div', 'phrase');
      var head = el('div', 'head');
      if (VietAudio.available()) {
        head.appendChild(playButton('播放 ' + text, function () { return VietAudio.playText(text); }));
      }
      if (table) {
        // the whole input read in one go, for reading it out as a sentence
        head.appendChild(el('p', 'line', syls.map(function (s) {
          var r = !problem(s) && VietReading.read(s, table);
          return r ? r.py : '？';
        }).join(' ')));
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
    }

    var url = new URL(location.href);
    if (text) url.searchParams.set('q', text); else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }

  if (VietAudio.setProgress) {
    VietAudio.setProgress(function (f) {
      showAudio(f == null ? '' : '第一次播放要下载语音（63 MB，之后不用联网）：' + Math.round(f * 100) + '%');
    });
  }

  q.addEventListener('input', render);
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    q.blur();
  });

  q.value = new URL(location.href).searchParams.get('q') || '';

  // ?table=test/... loads a render-test fixture instead of the real table.
  var tablePath = new URL(location.href).searchParams.get('table') || '';
  if (!/^test\/[\w-]+\.json$/.test(tablePath)) tablePath = 'data/table.json';

  fetch(tablePath, { cache: 'no-cache' })
    .then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (t) {
      table = t;
      if (!t) showStatus('对照表还没做好：下面只按拼写拆了声母、韵母和声调，还没有读法。');
    })
    .catch(function (err) {
      showStatus('对照表读取失败：' + (err && err.message || err));
    })
    .then(render);
})();
