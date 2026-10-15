/* 外发模式：?press=1 收成单场景可分享页；?press=2 只留画面，用于出封面与关键帧 */
(function () {
  const m = location.search.match(/[?&]press=(\d)/);
  if (!m) return;

  document.getElementById('boot').remove();
  const scLabel = document.getElementById('scTag').textContent.replace(/ · b\d+$/, '');
  document.title = scLabel + ' · 大脑回路示意';

  if (m[1] === '2') {
    document.body.classList.add('shot');
    const cap = document.createElement('div');
    cap.className = 'shot-cap';
    cap.innerHTML = scLabel + '<em>' +
      document.getElementById('scrubName').textContent + ' · ' +
      document.getElementById('scrubTime').textContent + '</em>';
    document.querySelector('main.stage').appendChild(cap);
    const mark = document.createElement('div');
    mark.className = 'shot-mark';
    mark.textContent = 'NEURAL LINK · 大脑回路可视化 17 场景系列 · 示意模型，非诊疗建议';
    document.querySelector('main.stage').appendChild(mark);
    return;
  }

  document.querySelector('nav.scenarios').style.display = 'none';
  document.getElementById('scAll').style.display = 'none';
  document.querySelector('#stages .fx-card').classList.add('open');

  const foot = document.createElement('div');
  foot.className = 'press-foot';
  foot.innerHTML =
    '<p><b>示意模型</b>核团坐标与投射按讲解需要简化，非解剖精度；用于科普与心理教育，不构成诊疗建议。</p>' +
    '<p><b>证据等级</b>A 随机对照证据较充分 · B 外推自相邻领域 · C 机制推演缺直接证据。本场景 4 条干预的参考文献【待补】。</p>' +
    '<p><b>授权与定制</b>本图出自 17 个场景系列，可按栏目选题更换场景、配色与文案。联系【待填】。</p>';
  document.getElementById('legend').appendChild(foot);
})();
