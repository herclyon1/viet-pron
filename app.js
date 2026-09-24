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
  var marksBox = document.getElementById('marks');
  var markList = document.getElementById('marklist');
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

  function renderSyllable(s, seenMarks) {
    var cell = el('div', 'syl');
    cell.appendChild(el('span', 'vi', s.src));
    var pr = el('span', 'pr');
    cell.appendChild(pr);

    if (s.error) {
      cell.classList.add('bad');
      var msg = ERRORS[s.error] + (s.bad ? '「' + s.bad + '」' : '');
      pr.appendChild(el('span', 'err', msg));
      return cell;
    }

    if (!table) {
      // Table not loaded: show only the spelling split, clearly marked as such.
      pr.classList.add('raw');
      pr.textContent = (s.initial ? s.initial + ' + ' : '') + s.rhyme + ' · ' + TONE_NAMES[s.tone];
      return cell;
    }

    var ini = (table.initials || {})[s.initial];
    var rh = (table.rhymes || {})[s.rhyme];
    var tn = lookupTone(s);
    var missing = [];
    if (!ini) missing.push('声母「' + (s.initial || '无') + '」');
    if (!rh) missing.push('韵母「' + s.rhyme + '」');
    if (!tn) missing.push('声调「' + TONE_NAMES[s.tone] + '」');
    if (missing.length) {
      cell.classList.add('bad');
      pr.appendChild(el('span', 'err', '对照表里没有' + missing.join('、')));
      return cell;
    }

    // No written initial and the rhyme starts with a glide: the rhyme's zero form
    // is read without the glottal stop (Kirby 2011 p. 382: oan [wan]).
    var useZero = s.initial === '' && rh.zero != null;
    if (ini.text && !useZero) {
      pr.appendChild(marked('ini', ini.text, seenMarks));
      pr.appendChild(el('span', 'plus', '+'));
    }
    pr.appendChild(marked('rh', useZero ? rh.zero : rh.text, seenMarks));
    var tone = el('span', 'tone');
    tone.appendChild(el('span', 'digits', tn.digits));
    var c = toneCurve(tn.digits);
    if (c) tone.appendChild(c);
    if (tn.text) tone.appendChild(el('span', 'tonetext', tn.text));
    pr.appendChild(tone);

    // Tap a syllable to see where each part's reading comes from.
    var src = el('div', 'src');
    src.hidden = true;
    src.appendChild(el('div', null, '声母：' + (ini.src || '缺出处')));
    src.appendChild(el('div', null, '韵母：' + (rh.src || '缺出处')));
    src.appendChild(el('div', null, '声调：' + (tn.src || '缺出处')));
    cell.appendChild(src);
    cell.addEventListener('click', function () { src.hidden = !src.hidden; });
    return cell;
  }

  // Split a reading into plain runs and marks: longest mark first, no overlap,
  // so NGM wins over NH, KP over K and P, NH / CH over H.
  var markKeys = null;
  function markTokens(text) {
    if (!markKeys) markKeys = Object.keys(table.marks || {}).sort(function (a, b) { return b.length - a.length; });
    var out = [], plain = '';
    for (var i = 0; i < text.length;) {
      var hit = null;
      for (var k = 0; k < markKeys.length; k++) {
        if (text.startsWith(markKeys[k], i)) { hit = markKeys[k]; break; }
      }
      if (hit) {
        if (plain) { out.push({ t: plain }); plain = ''; }
        out.push({ t: hit, mark: true });
        i += hit.length;
      } else {
        plain += text[i++];
      }
    }
    if (plain) out.push({ t: plain });
    return out;
  }

  // Reading text with marks set apart; records each mark in seen (first use order).
  function marked(cls, text, seen) {
    var span = el('span', cls);
    markTokens(text || '').forEach(function (tok) {
      if (!tok.mark) { span.appendChild(document.createTextNode(tok.t)); return; }
      span.appendChild(el('span', 'mk', tok.t));
      if (seen.indexOf(tok.t) < 0) seen.push(tok.t);
    });
    return span;
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

  function renderMarks(seen) {
    markList.textContent = '';
    marksBox.hidden = !seen.length;
    seen.forEach(function (m) {
      var info = table.marks[m];
      var li = el('li');
      li.appendChild(el('span', 'mark', m));
      var body = el('div', 'markbody');
      body.appendChild(el('div', 'say', info.say || ''));
      if (info.src) body.appendChild(el('div', 'src', info.src));
      li.appendChild(body);
      if (info.audio && VietAudio.available()) {
        li.appendChild(playButton('播放 ' + m, function () { return VietAudio.playSample(info.audio); }));
      }
      markList.appendChild(li);
    });
  }

  function render() {
    var text = q.value.trim();
    out.textContent = '';
    var seen = [];
    if (text) {
      var syls = VietParse.splitText(text);
      var row = el('div', 'phrase');
      if (VietAudio.available()) {
        row.appendChild(playButton('播放 ' + text, function () { return VietAudio.playText(text); }));
      }
      var list = el('div', 'syls');
      syls.forEach(function (s) { list.appendChild(renderSyllable(s, seen)); });
      row.appendChild(list);
      out.appendChild(row);
    }
    if (table) renderMarks(seen); else marksBox.hidden = true;

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
