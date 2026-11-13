import { METRICS, assignmentsFor, participantFromCode, pairReady, emptyDraft, draftComplete, draftKey, mediaUrl, collectionOpen, sha256, newRecord } from './study-core.mjs';

const app = document.querySelector('#app');
const metrics = {
  task: ['任务完成', '需求中的内容与表达目标'],
  flow: ['组织与节奏', '顺序、衔接与节奏的连贯性'],
  impact: ['表达效果', '信息、情绪与注意力的有效传达'],
  av: ['声画协调', '声音清晰、搭配适切与时序协调']
};
const preferenceNames = { A: 'A 更好', tie: '基本相当', B: 'B 更好' };
let study;
let participantId;
let invitation = '';
let profile = { consent: false, editing_experience: 'unspecified' };
let currentIndex = 0;
let localStorageWorks = true;
let busy = false;
let cancelSubmission = null;
const SUBMISSION_WAIT_MS = 45000;
const drafts = new Map();

const escapeHtml = function (text) { return String(text ?? '').replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); };
const el = function (id) { return document.getElementById(id); };
const localGet = function (key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { localStorageWorks = false; return null; } };
const localSet = function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { localStorageWorks = false; return false; } };
const profileKey = function () { return study.id + ':' + participantId + ':profile'; };
const assigned = function () { return assignmentsFor(study, participantId); };
const currentAssignment = function () { return assigned()[currentIndex]; };
function draftFor(assignment) {
  const key = draftKey(study.id, participantId, assignment.pair);
  if (!drafts.has(key)) {
    const saved = localGet('review:' + key);
    drafts.set(key, saved && saved.ratings && saved.watch ? { ...emptyDraft(), ...saved } : emptyDraft());
  }
  return drafts.get(key);
}
function persist(assignment) {
  const ok = localSet('review:' + draftKey(study.id, participantId, assignment.pair), draftFor(assignment));
  const status = el('draft-state');
  if (status) status.textContent = ok ? '草稿已保存在这台设备' : '当前浏览器无法保存草稿，请先下载备份';
  return ok;
}
function setStatus(text, kind = '') { const status = el('submit-status') || el('entry-status'); if (status) { status.textContent = text; status.className = 'status ' + kind; } }

function renderEntry() {
  app.innerHTML = '<section class="welcome"><div><p class="eyebrow">独立人工评审</p><h1>两条成片，<br>你的独立判断。</h1><p class="intro-copy">结合相同的任务要求，观看匿名 A／B 成片，告诉我们哪条更好，以及各自完成得怎么样。</p><div class="workload"><div><strong>6</strong><span>组成片对</span></div><div><strong>12</strong><span>条完整视频</span></div><div><strong>4</strong><span>项评分维度</span></div></div><p class="intro-note">可以中途休息，回来继续。每组答案独立保存，不需要一次完成全部任务。</p></div><form class="entry-card" id="entry-form"><h2>开始你的评审</h2><p>输入组织者发给你的评委邀请码。</p><label class="field-label" for="invitation">评委邀请码</label><input class="code-input" id="invitation" name="invitation" type="text" autocomplete="off" spellcheck="false" placeholder="粘贴你的邀请码" required><span class="field-label">剪辑经验（仅作研究背景）</span><div class="experience"><label><input type="radio" name="experience" value="none" checked> 没有经验</label><label><input type="radio" name="experience" value="occasional"> 偶尔剪辑</label><label><input type="radio" name="experience" value="frequent"> 经常／专业剪辑</label></div><label class="consent"><input type="checkbox" id="consent" required><span>我自愿参与，了解匿名评分将用于研究分析。我可以随时停止，未提交内容只保存在当前设备。</span></label><button class="button full" type="submit">进入评审 <span aria-hidden="true">→</span></button><p class="status" id="entry-status" role="status"></p></form></section>';
  app.querySelector('.welcome .eyebrow').textContent = '独立人工评审';
  el('entry-form').querySelector('.consent span').textContent = '我自愿参与。评审记录保存在研究组织者的私人表格中；邀请码会将我的六组成片评审关联起来，网站不收集姓名或邮箱。评分、偏好、选填理由及大致播放进度用于研究分析。未提交草稿保存在当前设备。我可以随时停止；如需撤回已提交答案，请通过邀请渠道联系组织者。';
  el('invitation').value = invitation;
  el('entry-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const code = el('invitation').value.trim();
    const id = participantFromCode(code);
    if (!id || !study.assignments[id]) { setStatus('邀请码格式不正确，请核对组织者发给你的完整邀请码。', 'error'); return; }
    participantId = id;
    invitation = code;
    const savedProfile = localGet(profileKey());
    profile = savedProfile || { consent: true, editing_experience: new FormData(el('entry-form')).get('experience') };
    profile.consent = el('consent').checked;
    localSet(profileKey(), profile);
    try { sessionStorage.setItem(study.id + ':invitation', invitation); } catch { /* An invitation can be entered again after reload. */ }
    const rows = assigned();
    const next = rows.findIndex(function (row) { return pairReady(row.pair) && !draftFor(row).receipt; });
    currentIndex = next >= 0 ? next : 0;
    renderWorkspace();
  });
}

function tabState(assignment) {
  if (!pairReady(assignment.pair)) return '素材待开放';
  const draft = draftFor(assignment);
  return draft.receipt ? '已提交 ✓' : draftComplete(draft) ? '待提交' : draft.preference ? '填写中' : '待评审';
}

function renderWorkspace() {
  const rows = assigned();
  const assignment = currentAssignment();
  const done = rows.filter(function (row) { return draftFor(row).receipt; }).length;
  const ready = rows.filter(function (row) { return pairReady(row.pair); }).length;
  app.innerHTML = '<div class="workspace-header"><div><p class="eyebrow">成片评审</p><h1>你的评审任务</h1><p>完整观看，独立判断。可以回放，也可以稍后继续。</p></div><div class="participant"><strong>评委 ' + escapeHtml(participantId) + '</strong><span>已提交 ' + done + ' / 6 组</span><progress class="progress-track" value="' + done + '" max="6" aria-label="已提交组数"></progress></div></div><nav class="task-tabs" aria-label="六组评审任务">' + rows.map(function (row, index) { return '<button type="button" class="task-tab' + (index === currentIndex ? ' active' : '') + '" data-index="' + index + '"' + (index === currentIndex ? ' aria-current="step"' : '') + '><span class="tab-number">PAIR ' + String(index + 1).padStart(2, '0') + '</span><span class="tab-name">' + escapeHtml(row.pair.title || '任务待开放') + '</span><span class="tab-state">' + tabState(row) + '</span></button>'; }).join('') + '</nav><div id="workspace-notice"></div>' + (done === 6 ? '<div class="all-done">六组已全部提交，感谢你的认真观看。答案已收到；你仍可以下载个人备份。</div>' : '') + '<section id="pair-content"></section><div class="bottom-tools"><span>' + ready + ' / 6 组素材已开放 · 刷新页面可获取后续任务</span><div><button class="text-button" id="export-all" type="button">下载答案备份</button><button class="text-button" id="switch-reviewer" type="button">切换评委</button></div></div>';
  app.querySelector('.workspace-header .eyebrow').textContent = '成片评审';
  app.querySelectorAll('.tab-number').forEach(function (element, index) { element.textContent = '第 ' + String(index + 1).padStart(2, '0') + ' 组'; });
  document.querySelectorAll('.task-tab').forEach(function (button) { button.addEventListener('click', function () { if (busy) return; currentIndex = Number(button.dataset.index); renderWorkspace(); }); });
  el('switch-reviewer').addEventListener('click', function () { if (busy) return; try { sessionStorage.removeItem(study.id + ':invitation'); } catch {} invitation = ''; participantId = null; renderEntry(); });
  el('export-all').addEventListener('click', exportBackup);
  if (!collectionOpen(study)) el('workspace-notice').innerHTML = '<div class="notice neutral">当前开放视频预览，正式提交尚未开放。可以观看视频、保存本地草稿和下载备份；请等待组织者通知后再正式评审。</div>';
  if (!localStorageWorks) el('workspace-notice').innerHTML += '<div class="notice">浏览器无法保存草稿。离开前请下载备份，避免丢失。</div>';
  renderPair(assignment);
}

function taskBrief(pair) {
  if (!pair.instruction) return '';
  const summary = pair.instruction_summary || pair.instruction;
  const details = pair.instruction_summary ? '<details class="task-details"><summary>查看完整任务要求</summary><p>' + escapeHtml(pair.instruction) + '</p></details>' : '';
  const note = pair.instruction_note ? '<p class="task-note">' + escapeHtml(pair.instruction_note) + '</p>' : '';
  return '<div class="card task-brief"><span class="brief-tag">任务要求</span><div><h2>' + escapeHtml(pair.title) + '</h2><p class="task-summary">' + escapeHtml(summary) + '</p>' + details + note + '</div></div>';
}

function renderPair(assignment) {
  const pair = assignment.pair;
  const content = el('pair-content');
  if (!pairReady(pair)) {
    content.innerHTML = taskBrief(pair) + '<div class="card pending-panel"><span class="pending-icon" aria-hidden="true">Ⅱ</span><p class="eyebrow">待开放</p><h2>这组成片还在准备中</h2><p>你的六组任务位置已经保留。素材会陆续补充，开放后即可继续；现在不需要填写评分。</p><div class="pending-list"><span>匿名 A／B 成片</span><span>一次总体偏好</span><span>两条 × 四项评分</span></div></div>';
    content.querySelector('.eyebrow').textContent = '待开放';
    return;
  }
  const draft = draftFor(assignment);
  content.innerHTML = taskBrief(pair) + '<div class="video-grid">' + ['A', 'B'].map(function (slot) {
    const clip = pair.clips.find(function (candidate) { return candidate.id === assignment[slot]; });
    const url = mediaUrl(clip.media.url, location.href);
    const player = clip.media.type === 'drive' ? '<iframe src="' + escapeHtml(url) + '" title="成片 ' + slot + '" allow="fullscreen" referrerpolicy="no-referrer" allowfullscreen></iframe>' : '<video id="video-' + slot + '" controls playsinline preload="metadata" src="' + escapeHtml(url) + '" aria-label="成片 ' + slot + '"></video>';
    return '<article class="card video-card"><div class="video-heading"><b>成片 ' + slot + '</b><span>完整成片 · 可回放</span></div><div class="video-surface">' + player + '</div><div class="video-footer"><span id="play-state-' + slot + '">' + (clip.media.type === 'drive' ? '在播放器中观看完整成片' : '请完整观看') + '</span><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">单独打开 ↗</a></div></article>';
  }).join('') + '</div><p class="playback-note">建议使用耳机。两条视频按 A → B 顺序完整观看；播放或语言理解有困难时，请先保存草稿并联系组织者，不要因此给 0 分。</p><div class="card preference-card"><p class="section-label">总体偏好</p><h2>结合任务要求，你更愿意采用哪条成片？</h2><p>先给整体判断，再分别评分。两条同样好或同样差，都可以选“基本相当”。</p><div class="preference-options">' + Object.entries(preferenceNames).map(function ([value, name]) { return '<button class="choice-button' + (draft.preference === value ? ' selected' : '') + '" type="button" data-preference="' + value + '" aria-pressed="' + (draft.preference === value) + '"' + (draft.receipt ? ' disabled' : '') + '>' + name + '</button>'; }).join('') + '</div><div class="preference-summary" id="preference-summary"></div></div><section id="ratings-section"></section>';
  content.querySelector('.brief-tag').textContent = '任务要求';
  content.querySelector('.preference-card .section-label').textContent = '总体偏好';
  document.querySelectorAll('[data-preference]').forEach(function (button) { button.addEventListener('click', function () {
    draft.preference = button.dataset.preference;
    persist(assignment);
    updatePreference(assignment);
    renderRatings(assignment);
  }); });
  updatePreference(assignment);
  renderRatings(assignment);
  ['A', 'B'].forEach(function (slot) { attachPlayback(assignment, slot); });
}

function updatePreference(assignment) {
  const draft = draftFor(assignment);
  document.querySelectorAll('[data-preference]').forEach(function (button) {
    button.classList.toggle('selected', button.dataset.preference === draft.preference);
    button.setAttribute('aria-pressed', String(button.dataset.preference === draft.preference));
  });
  el('preference-summary').textContent = draft.preference ? '整体判断已记下：' + preferenceNames[draft.preference] + '。可以继续填写四项评分。' : '';
}

function renderRatings(assignment) {
  const draft = draftFor(assignment);
  const section = el('ratings-section');
  if (!draft.preference) { section.innerHTML = '<div class="empty-section">完成整体偏好选择后，填写两条成片的四项评分。</div>'; return; }
  section.innerHTML = '<div class="card rating-card"><p class="section-label">分项评分</p><h2>分别评价两条成片</h2><p class="subtitle">四项各选 0–4 分，可以同分。</p><div class="rating-grid">' + ['A','B'].map(function (slot) {
    return '<div class="rating-column"><h3>成片 ' + slot + '</h3>' + METRICS.map(function (metric) {
      return '<div class="metric-row" role="group" aria-label="成片 ' + slot + ' ' + metrics[metric][0] + '"><span class="metric-name">' + metrics[metric][0] + '</span><span class="metric-detail">' + metrics[metric][1] + '</span><div class="score-options">' + [0,1,2,3,4].map(function (score) { return '<button class="score-button' + (draft.ratings[slot][metric] === score ? ' selected' : '') + '" type="button" data-slot="' + slot + '" data-metric="' + metric + '" data-score="' + score + '" aria-label="成片 ' + slot + ' ' + metrics[metric][0] + ' ' + (score + ' 分') + '" aria-pressed="' + (draft.ratings[slot][metric] === score) + '"' + (draft.receipt ? ' disabled' : '') + '>' + score + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
  }).join('') + '</div><div class="scale-note">0 基本未实现 · 1 明显不足 · 2 部分实现 · 3 基本良好 · 4 完成出色 <button class="text-button" id="inline-guide" type="button">查看维度说明</button></div><label class="field-label" for="reason">最影响判断的原因（选填）</label><textarea id="reason" class="reason" maxlength="2000" placeholder="可以写一个具体问题、亮点或时间点。"' + (draft.receipt ? ' readonly' : '') + '>' + escapeHtml(draft.reason) + '</textarea><div class="submit-row"><span class="draft-state" id="draft-state">草稿保存在这台设备</span><div class="submit-actions"><button class="button secondary" type="button" id="save-draft">保存草稿</button><button class="button" type="button" id="submit-review">提交本组</button></div></div><p class="status" id="submit-status" role="status"></p><div id="receipt"></div></div>';
  section.querySelector('.section-label').textContent = '分项评分';
  el('inline-guide').addEventListener('click', function () { el('guide-dialog').showModal(); });
  document.querySelectorAll('[data-score]').forEach(function (button) { button.addEventListener('click', function () {
    draft.ratings[button.dataset.slot][button.dataset.metric] = Number(button.dataset.score);
    document.querySelectorAll('[data-score]').forEach(function (candidate) {
      const selected = draft.ratings[candidate.dataset.slot][candidate.dataset.metric] === Number(candidate.dataset.score);
      candidate.classList.toggle('selected', selected);
      candidate.setAttribute('aria-pressed', String(selected));
    });
    persist(assignment);
    updateSubmit(assignment);
  }); });
  el('reason').addEventListener('input', function () { draft.reason = el('reason').value; persist(assignment); });
  el('save-draft').addEventListener('click', function () { setStatus(persist(assignment) ? '草稿已保存，可以稍后继续。' : '草稿保存失败，请下载答案备份。', localStorageWorks ? 'success' : 'error'); });
  el('submit-review').addEventListener('click', function () { submitReview(assignment); });
  updateSubmit(assignment);
  if (draft.receipt) renderReceipt(assignment);
}

function updateSubmit(assignment) {
  const draft = draftFor(assignment);
  const button = el('submit-review');
  if (!button) return;
  button.disabled = busy || Boolean(draft.receipt) || !draftComplete(draft) || !collectionOpen(study);
  button.textContent = draft.receipt ? '本组已提交' : busy ? '正在确认接收…' : '提交本组';
  if (!draft.receipt && !collectionOpen(study)) setStatus('正式提交尚未开放，当前可保存草稿和下载备份。');
}

function showSubmissionHelp(waiting = false) {
  el('submission-help')?.remove();
  const container = document.createElement('div');
  container.id = 'submission-help';
  container.className = 'notice neutral';
  const message = document.createElement('p');
  message.textContent = waiting
    ? '正在等待 Google 确认，通常最多等待 45 秒。请保持当前页面在前台。'
    : '请点击“下载答案备份”，将下载的 JSON 文件通过原来的问卷邀请渠道发给问卷发布者，协助补交。文件包含当前已填写的各组答案，不用重新评分。';
  container.append(message);
  if (waiting) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button secondary';
    cancel.textContent = '停止等待，保留答案';
    cancel.addEventListener('click', function () { cancelSubmission?.(); });
    container.append(cancel, document.createTextNode(' '));
  }
  const backup = document.createElement('button');
  backup.type = 'button';
  backup.className = waiting ? 'button secondary' : 'button';
  backup.textContent = '下载答案备份';
  backup.addEventListener('click', exportBackup);
  const connection = document.createElement('a');
  connection.href = study.collection.endpoint;
  connection.target = '_blank';
  connection.rel = 'noopener noreferrer';
  connection.textContent = '检查 Google 连接 ↗';
  container.append(backup, document.createTextNode(' '), connection);
  el('submit-status').after(container);
}

function renderReceipt(assignment) {
  const draft = draftFor(assignment);
  const date = new Date(draft.receipt.received_at).toLocaleString('zh-CN', { hour12: false });
  el('receipt').innerHTML = '<div class="saved-receipt">✓ 答案已收到 · ' + escapeHtml(date) + '<br><small>回执 ' + escapeHtml(draft.receipt.submission_id.slice(0, 8)) + '</small> <button type="button" class="text-button" id="revise-review">修改本组</button></div>';
  el('revise-review').addEventListener('click', function () {
    draft.history.push({ record: draft.pending_record, receipt: draft.receipt });
    draft.supersedes_submission_id = draft.receipt.submission_id;
    draft.receipt = null;
    draft.pending_record = null;
    persist(assignment);
    renderWorkspace();
  });
}

async function submitReview(assignment) {
  const draft = draftFor(assignment);
  if (busy || !draftComplete(draft) || draft.receipt || !pairReady(assignment.pair)) return;
  if (!collectionOpen(study)) { setStatus('正式提交尚未开放，草稿已保留。'); return; }
  busy = true;
  updateSubmit(assignment);
  document.querySelectorAll('[data-score], [data-preference], #reason, .task-tab, #switch-reviewer').forEach(function (element) { element.disabled = true; });
  try {
    const fresh = newRecord(study, participantId, assignment, draft, profile);
    const previous = draft.pending_record;
    const contentOf = function (record) { return JSON.stringify([record.presentation, record.preference, record.ratings, record.reason, record.profile, record.supersedes_submission_id]); };
    if (!previous || contentOf(previous) !== contentOf(fresh)) draft.pending_record = fresh;
    persist(assignment);
    setStatus('正在提交，等待收集端确认。请先保留当前页面。');
    showSubmissionHelp(true);
    const receipt = await sendToGoogle(draft.pending_record);
    draft.receipt = receipt;
    persist(assignment);
    busy = false;
    renderWorkspace();
    setStatus('本组提交成功，可以继续下一组。', 'success');
  } catch (error) {
    busy = false;
    renderWorkspace();
    setStatus(error.message || '未收到接收确认，草稿已保留。可以稍后重试或下载备份。', 'error');
    showSubmissionHelp();
  }
}

function sendToGoogle(record) {
  const raw = JSON.stringify(record);
  return new Promise(function (resolve, reject) {
    const started = Date.now();
    let settled = false;
    let frame;
    let form;
    let payloadHash;
    let channel;
    const cancel = function () { finish(new Error('已停止等待，答案已保留；这不会撤销可能已入表的提交。请保持答案不变后重试，或下载备份。')); };
    const cleanup = function () {
      clearTimeout(timer); clearInterval(progress);
      window.removeEventListener('message', listener);
      window.removeEventListener('pageshow', checkDeadline);
      document.removeEventListener('visibilitychange', checkDeadline);
      form?.remove(); frame?.remove();
      if (cancelSubmission === cancel) cancelSubmission = null;
    };
    const finish = function (error, receipt) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(receipt);
    };
    const checkDeadline = function () {
      const elapsed = Date.now() - started;
      if (elapsed >= SUBMISSION_WAIT_MS) {
        finish(new Error('45 秒内未收到接收确认，答案已保留。请下载答案备份文件，发给问卷发布者协助补交，无需重新评分。'));
      } else if (el('submit-review')) {
        el('submit-review').textContent = '正在确认接收…（' + Math.floor(elapsed / 1000) + ' 秒）';
      }
    };
    const listener = function (event) {
      let trustedOrigin = false;
      try { const origin = new URL(event.origin); trustedOrigin = origin.protocol === 'https:' && (origin.hostname === 'script.google.com' || origin.hostname.endsWith('.googleusercontent.com')); } catch {}
      if (!trustedOrigin || event.data?.type !== 'video-review-receipt' || event.data.channel !== channel) return;
      const result = event.data;
      if (result.ok && result.submission_id === record.submission_id && result.payload_sha256 === payloadHash && result.received_at) finish(null, result);
      else if (!result.ok) finish(new Error(result.message || '收集端未接收本次答案，草稿已保留。'));
      else finish(new Error('接收回执与本组答案不一致，尚未确认成功。请保留备份并联系组织者。'));
    };
    const timer = setTimeout(checkDeadline, SUBMISSION_WAIT_MS);
    const progress = setInterval(checkDeadline, 1000);
    cancelSubmission = cancel;
    window.addEventListener('pageshow', checkDeadline);
    document.addEventListener('visibilitychange', checkDeadline);
    window.addEventListener('message', listener);
    // Include hashing in the same wait limit, and never send after cancellation.
    (async function () {
      payloadHash = await sha256(raw);
      const authHash = await sha256(invitation);
      if (settled) return;
      channel = globalThis.crypto.randomUUID();
      frame = document.createElement('iframe');
      frame.name = 'review-receipt-' + channel;
      frame.className = 'transport-frame';
      frame.title = '答案提交回执';
      form = document.createElement('form');
      form.method = 'POST'; form.action = study.collection.endpoint; form.target = frame.name; form.hidden = true;
      for (const [name,value] of Object.entries({ payload: raw, auth_hash: authHash, channel })) { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input); }
      document.body.append(frame, form);
      form.submit();
    })().catch(function (error) { finish(error); });
  });
}

function attachPlayback(assignment, slot) {
  const video = el('video-' + slot);
  if (!video) return;
  let previous = null;
  const draft = draftFor(assignment);
  video.addEventListener('play', function () {
    document.querySelectorAll('video').forEach(function (other) { if (other !== video) other.pause(); });
    previous = video.currentTime;
  });
  video.addEventListener('loadedmetadata', function () { if (Number.isFinite(video.duration)) draft.watch[slot].duration = video.duration; });
  video.addEventListener('seeking', function () { previous = null; });
  video.addEventListener('timeupdate', function () {
    if (draft.receipt) return;
    const delta = previous === null ? 0 : video.currentTime - previous;
    if (!video.paused && delta > 0 && delta < 2) draft.watch[slot].played_seconds = Math.round((draft.watch[slot].played_seconds + delta) * 100) / 100;
    previous = video.currentTime;
  });
  video.addEventListener('pause', function () { persist(assignment); });
  video.addEventListener('ended', function () { el('play-state-' + slot).textContent = '已播放到片尾 · 可回看'; persist(assignment); });
  video.addEventListener('error', function () { el('play-state-' + slot).textContent = '播放器暂时无法打开，可尝试单独打开'; });
}

function exportBackup() {
  if (!participantId) return;
  const backup = { schema_version: 'paired_video_review_local_backup_v1', study_id: study.id, study_version: study.version, participant_id: participantId, profile, exported_at: new Date().toISOString(), answers: assigned().map(function (assignment) { return { pair_id: assignment.pair_id, pair_fingerprint: assignment.pair.fingerprint, presentation: { A: assignment.A, B: assignment.B }, draft: draftFor(assignment) }; }) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'review-' + participantId + '-backup.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

el('guide-toggle').addEventListener('click', function () { el('guide-dialog').showModal(); });
el('guide-close').addEventListener('click', function () { el('guide-dialog').close(); });
window.addEventListener('pagehide', function () { if (participantId) assigned().forEach(persist); });

try {
  const response = await fetch('./study.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('任务暂时无法加载');
  study = await response.json();
  const parameters = new URLSearchParams(location.hash.slice(1));
  invitation = parameters.get('code') || '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (!invitation) { try { invitation = sessionStorage.getItem(study.id + ':invitation') || ''; } catch {} }
  renderEntry();
  const id = participantFromCode(invitation);
  const savedProfile = id ? localGet(study.id + ':' + id + ':profile') : null;
  if (savedProfile?.consent) { participantId = id; profile = savedProfile; renderWorkspace(); }
} catch {
  app.innerHTML = '<div class="card pending-panel"><h1>暂时无法加载任务</h1><p>请检查网络后刷新页面。已保存的草稿不会被清除。</p></div>';
}
