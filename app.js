const state = { channels: [], logs: [], selectedId: null, demo: true, days: 7, scores: new Map() };
const $ = (s) => document.querySelector(s);
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: d });
const pct = (n, d = 1) => `${(Number(n || 0) * 100).toFixed(d)}%`;
const dateKey = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
const today = new Date();
$('#reportDate').value = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

function daysAgo(n) { return Math.floor((Date.now() - n * 86400000) / 1000); }
function demoData() {
  const channels = [
    { id: 355, name: 'OpenAI · 主力', status: 1, response_time: 620, used_quota: 18420000, balance: 42680000, models: 'gpt-4o,gpt-4o-mini' },
    { id: 417, name: 'Claude · 稳定备用', status: 1, response_time: 910, used_quota: 12840000, balance: 25100000, models: 'claude-3-5-sonnet,claude-3-haiku' },
    { id: 288, name: 'DeepSeek · 性价比', status: 1, response_time: 740, used_quota: 9680000, balance: 18300000, models: 'deepseek-chat,deepseek-reasoner' },
    { id: 502, name: 'Gemini · 长上下文', status: 1, response_time: 1380, used_quota: 7420000, balance: 8800000, models: 'gemini-1.5-pro' },
    { id: 163, name: 'Azure · 低优先级', status: 0, response_time: 2140, used_quota: 3220000, balance: 4500000, models: 'gpt-4o' },
    { id: 526, name: '国内聚合 · 新渠道', status: 1, response_time: 1180, used_quota: 2640000, balance: 7600000, models: 'qwen-plus,glm-4' },
  ];
  const models = ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'deepseek-chat', 'gemini-1.5-pro'];
  const logs = [];
  channels.forEach((c, ci) => {
    for (let d = 0; d < 7; d++) {
      const count = Math.max(5, 42 - ci * 5 - d * 2 + ((ci + d) % 4) * 3);
      for (let i = 0; i < count; i++) {
        const fail = (ci === 4 && i % 4 === 0) || (ci === 3 && i % 17 === 0) || (ci === 5 && i % 13 === 0);
        const model = models[(i + ci) % models.length];
        const use = Math.round((c.response_time * (0.8 + ((i * 17) % 50) / 100)) + (fail ? 1200 : 0));
        logs.push({ id: `${c.id}-${d}-${i}`, channel: c.id, channel_name: c.name, created_at: daysAgo(d) - i * 190, type: fail ? 5 : 2, content: fail ? (i % 2 ? '上游超时，请稍后重试' : '429 rate limit') : '请求成功', model_name: model, quota: Math.round((90 + (i * 37) % 230) * (fail ? .8 : 1)), prompt_tokens: 600 + (i * 73) % 1000, completion_tokens: 220 + (i * 41) % 700, use_time: use, request_id: `req_${c.id}_${d}_${i}`, is_stream: i % 2 === 0 });
      }
    }
  });
  return { channels, logs };
}

function isError(log) { return Number(log.type) === 5 || /错误|失败|超时|rate.?limit|invalid|unauthor|error|timeout/i.test(String(log.content || '')); }
function analyze(channel, logs) {
  const items = logs.filter(l => Number(l.channel) === Number(channel.id));
  const requests = items.length, errors = items.filter(isError).length;
  const success = requests ? 1 - errors / requests : 0;
  const times = items.map(l => Number(l.use_time || l.response_time || 0)).filter(Boolean).sort((a,b)=>a-b);
  const avgTime = times.length ? times.reduce((a,b)=>a+b,0)/times.length : Number(channel.response_time || 0);
  const p95 = times.length ? times[Math.min(times.length - 1, Math.floor(times.length * .95))] : avgTime;
  const quota = items.reduce((s,l)=>s+Number(l.quota||0),0);
  const perRequest = requests ? quota / requests : 0;
  const modelMap = {}; items.forEach(l => { const k = l.model_name || '未知模型'; modelMap[k] = (modelMap[k]||0)+1; });
  const daily = {}; items.forEach(l => { const k = dateKey(l.created_at || Date.now()/1000); daily[k] = daily[k] || { requests: 0, errors: 0, quota: 0 }; daily[k].requests++; daily[k].quota += Number(l.quota||0); if(isError(l)) daily[k].errors++; });
  const vals = Object.values(daily); const recent = vals.slice(-Math.min(3, vals.length)).reduce((s,v)=>s+v.requests,0); const prior = vals.slice(0, Math.max(1, vals.length-3)).reduce((s,v)=>s+v.requests,0); const trend = prior ? (recent / Math.max(1, Math.min(3, vals.length)))/(prior / Math.max(1, vals.length-3)) - 1 : 0;
  const anomaly = items.filter(l => isError(l) || Number(l.use_time||0) > Math.max(2500, p95) || Number(l.quota||0) > perRequest*2.4).sort((a,b)=>Number(b.use_time||0)-Number(a.use_time||0)).slice(0, 8);
  const latencyScore = Math.max(0, Math.min(1, 1 - Math.max(0, avgTime - 450) / 1800));
  const costScore = Math.max(0, Math.min(1, 1 - Math.max(0, perRequest - 120) / 300));
  const coverageScore = Math.min(1, Object.keys(modelMap).length / 4);
  const trendScore = Math.max(0, Math.min(1, .6 + trend * .5));
  const score = Math.round(success*35 + (1-errors/Math.max(requests,1))*20 + latencyScore*15 + costScore*15 + coverageScore*8 + trendScore*7);
  let verdict = score >= 85 ? '建议续费' : score >= 70 ? '谨慎续费' : score >= 55 ? '暂不续费' : '建议更换渠道';
  const tone = score >= 85 ? 'good' : score >= 70 ? 'warn' : 'bad';
  return { channel, items, requests, errors, success, avgTime, p95, quota, perRequest, modelMap, daily, trend, anomaly, score, verdict, tone };
}

function setData(data, demo = false) { state.channels = data.channels || []; state.logs = data.logs || []; state.demo = demo; state.selectedId = state.selectedId && state.channels.some(c=>Number(c.id)===Number(state.selectedId)) ? state.selectedId : state.channels[0]?.id; renderAll(); $('#dataStatusText').textContent = demo ? '演示数据' : '已连接 NewAPI'; $('#dataStatusDot').classList.toggle('live', !demo); }
function selectedAnalysis() { const c = state.channels.find(c=>Number(c.id)===Number(state.selectedId)) || state.channels[0]; return c ? analyze(c, state.logs) : null; }
function renderChannels() { const q = $('#channelSearch').value.toLowerCase(); const list = state.channels.filter(c => String(c.name||'').toLowerCase().includes(q)); $('#channelCount').textContent = state.channels.length; $('#channelList').innerHTML = list.map(c => { const a = state.scores.get(c.id) || analyze(c,state.logs); return `<div class="channel-item ${Number(c.id)===Number(state.selectedId)?'active':''}" data-id="${c.id}"><div class="channel-item-top"><span class="channel-name">${c.name || `渠道 ${c.id}`}</span><span class="channel-score">${a.score}</span></div><div class="channel-item-meta"><span class="channel-pill ${Number(c.status) ? 'enabled':'disabled'}">${Number(c.status)?'启用':'停用'}</span><span>${pct(a.success)} 成功</span><span>${fmt(a.avgTime)}ms</span></div></div>`; }).join('') || '<div class="sidebar-note">暂无匹配渠道</div>'; document.querySelectorAll('.channel-item').forEach(el => el.addEventListener('click', ()=>{ state.selectedId = el.dataset.id; renderAll(); })); }
function metricCard(label, value, foot, tone='') { return `<div class="metric-card panel ${tone}"><span class="metric-label">${label}</span><strong class="metric-value">${value}</strong><span class="metric-foot">${foot}</span></div>`; }
function renderSummary(a) { if (!a) { $('#summaryGrid').innerHTML=''; $('#decisionPanel').innerHTML=''; return; } $('#summaryGrid').innerHTML = [metricCard('综合评分', `${a.score}<small>/100</small>`, '多维加权评分', a.tone), metricCard('成功率', pct(a.success), `${fmt(a.requests)} 次请求`, a.success >= .9 ? 'good' : 'warn'), metricCard('错误率', pct(a.errors/Math.max(a.requests,1)), `${a.errors} 条异常日志`, a.errors/a.requests < .08 ? 'good':'bad'), metricCard('平均响应', `${fmt(a.avgTime)}<small>ms</small>`, `P95 ${fmt(a.p95)}ms`, a.avgTime < 900 ? 'good':'warn'), metricCard('额度消耗', fmt(a.quota), `均次 ${fmt(a.perRequest,1)} quota`, a.perRequest < 180 ? 'good':'warn')].join(''); const reasons = [`成功率 ${pct(a.success)}`, `P95 ${fmt(a.p95)}ms`, `${Object.keys(a.modelMap).length} 个模型`, `趋势 ${a.trend>=0?'+':''}${pct(a.trend)}`]; $('#decisionPanel').className = `decision-panel panel ${a.tone}`; $('#decisionPanel').innerHTML = `<div class="decision-top"><div><p class="eyebrow">RECOMMENDATION</p><div class="decision-title">${a.verdict}</div></div><div class="decision-score"><strong>${a.score}</strong><span>/ 100</span></div></div><p class="decision-summary">${a.verdict === '建议续费' ? '该渠道在稳定性、成本和实际使用覆盖上表现均衡，建议按当前额度继续复充，并保留异常监测。' : a.verdict === '谨慎续费' ? '该渠道具备使用价值，但仍有成本或稳定性短板，建议小额续费并设置观察阈值。' : a.verdict === '暂不续费' ? '当前表现不足以支持继续投入，建议先观察修复结果，再决定是否恢复额度。' : '渠道的稳定性或成本效率明显偏弱，建议迁移流量并优先寻找替代渠道。'}</p><div class="decision-reasons">${reasons.map(x=>`<span class="reason-chip">${x}</span>`).join('')}</div>`; }
function renderTrend(a) { const keys = Object.keys(a.daily).sort(); const data = keys.slice(-Math.max(3,state.days)); if (!data.length) { $('#trendChart').innerHTML='<div class="sidebar-note">暂无趋势数据</div>'; return; } const W=900,H=210,pad={l:36,r:18,t:12,b:28}, iw=W-pad.l-pad.r,ih=H-pad.t-pad.b; const max=Math.max(...data.map(k=>a.daily[k].requests),1); const x=i=>pad.l+(i/(Math.max(data.length-1,1)))*iw; const y=v=>pad.t+ih-(v/max)*ih; const points=data.map((k,i)=>`${x(i)},${y(a.daily[k].requests)}`).join(' '); const ratePoints=data.map((k,i)=>`${x(i)},${pad.t+ih-(a.daily[k].requests ? (1-a.daily[k].errors/a.daily[k].requests)*ih : 0)}`).join(' '); $('#trendChart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g stroke="#edf0f4" stroke-width="1">${[0,.25,.5,.75,1].map(v=>`<line x1="${pad.l}" x2="${W-pad.r}" y1="${pad.t+ih*v}" y2="${pad.t+ih*v}"/>`).join('')}</g><polyline points="${points}" fill="none" stroke="#2e6de6" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${ratePoints}" fill="none" stroke="#149b70" stroke-width="2" stroke-linejoin="round" stroke-dasharray="4 4"/>${data.map((k,i)=>`<circle cx="${x(i)}" cy="${y(a.daily[k].requests)}" r="3.5" fill="#2e6de6"/><text x="${x(i)}" y="${H-7}" text-anchor="middle" font-size="10" fill="#8b96a8">${k.slice(5)}</text>`).join('')}</svg>`; }
function renderModels(a) { const entries=Object.entries(a.modelMap).sort((x,y)=>y[1]-x[1]); const top=entries.slice(0,4), total=entries.reduce((s,x)=>s+x[1],0); const colors=['#2e6de6','#7aa6ef','#149b70','#f2b34d']; let cum=0; const stops=[]; top.forEach(([,n],i)=>{ const end=cum+n/total*100; stops.push(`${colors[i]} ${cum}% ${end}%`); cum=end; }); if(cum<100) stops.push(`#e8edf4 ${cum}% 100%`); $('#modelDonut').style.setProperty('--p1', `${top.length ? top[0][1]/total*100 : 50}%`); $('#modelDonut').style.background=`conic-gradient(${stops.join(',')})`; $('#modelTotal').textContent=fmt(total); $('#modelLegend').innerHTML=top.map(([name,n],i)=>`<div class="legend-row"><span class="legend-name"><i class="legend-sw" style="background:${colors[i]}"></i>${name}</span><strong>${pct(n/total,0)}</strong></div>`).join(''); }
function renderCost(a) { const rows=[['均次额度', a.perRequest, 420, v=>`${fmt(v,1)}`],['平均响应', a.avgTime, 2400, v=>`${fmt(v)}ms`],['P95 响应', a.p95, 3200, v=>`${fmt(v)}ms`]]; $('#costChart').innerHTML=rows.map(([n,v,m,fmtv])=>`<div class="bar-row"><span class="bar-label">${n}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,v/m*100)}%"></div></div><span class="bar-value">${fmtv(v)}</span></div>`).join(''); }
function renderAnomalies(a) { $('#anomalyCount').textContent=a.anomaly.length; $('#anomalyTable').innerHTML = a.anomaly.map(l=>`<tr><td>${new Date(l.created_at*1000).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</td><td><span class="severity ${isError(l)?'high':'medium'}">${isError(l)?'错误':'慢请求'}</span></td><td>${l.model_name||'-'}</td><td>${fmt(l.use_time)}ms</td><td title="${l.request_id||''}">${String(l.content||'').slice(0,24)}</td></tr>`).join('') || '<tr><td colspan="5">当前窗口内暂无明显异常</td></tr>'; }
function renderReport(a) { if(!a){$('#reportPreview').textContent='暂无数据'; return;} const date=$('#reportDate').value; $('#reportPreview').innerHTML=`<strong>${date || '前一天'}日报</strong><br>${a.channel.name} · 评分 ${a.score} · ${a.verdict}<br>请求 ${fmt(a.requests)} 次，成功率 ${pct(a.success)}，消耗 ${fmt(a.quota)} quota，异常 ${a.anomaly.length} 条。`; }
function renderAll() { state.scores = new Map(state.channels.map(c=>[c.id, analyze(c,state.logs)])); const a=selectedAnalysis(); renderChannels(); renderSummary(a); if(a){renderTrend(a); renderModels(a); renderCost(a); renderAnomalies(a); renderReport(a); $('#windowLabel').textContent=`最近 ${state.days} 天`; $('#lastUpdated').textContent=`${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} 更新`; } }

async function apiFetch(url, headers) {
  const productionProxy = !['localhost', '127.0.0.1'].includes(location.hostname) && location.protocol.startsWith('http');
  if (productionProxy) {
    const response = await fetch('/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, headers }),
    });
    if (response.status === 404) return fetch(url, { headers, credentials: 'include' });
    return response;
  }
  return fetch(url, { headers, credentials: 'include' });
}
async function fetchPages(url, headers, maxPages = 20) {
  const result = [];
  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('p', page);
    pageUrl.searchParams.set('page_size', '100');
    const response = await apiFetch(pageUrl.toString(), headers);
    if (!response.ok) throw new Error(`接口返回 ${response.status}`);
    const json = await response.json();
    const items = json?.data?.items || [];
    result.push(...items);
    const total = Number(json?.data?.total || 0);
    if (!items.length || (total && result.length >= total) || items.length < 100) break;
  }
  return result;
}
async function loadRealData() { const base=$('#baseUrl').value.replace(/\/$/,''); const headers={'Content-Type':'application/json'}; if($('#userId').value) headers['New-Api-User']=$('#userId').value; const days=Number($('#days').value); state.days=days; const end=Math.floor(Date.now()/1000), start=end-days*86400; const channels=await fetchPages(`${base}/api/channel/`,headers); const all=[]; for(const c of channels){ try { const u=new URL(`${base}/api/log/`); u.searchParams.set('channel',c.id); u.searchParams.set('start_timestamp',start); u.searchParams.set('end_timestamp',end); all.push(...await fetchPages(u.toString(),headers)); } catch(e){} } setData({channels,logs:all},false); toast(`已拉取 ${channels.length} 个渠道、${all.length} 条日志`); }
function toast(msg) { const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),2600); }
function reportText() { const a=selectedAnalysis(); if(!a) return ''; const date=$('#reportDate').value || '前一天'; return `${date} 渠道日报\n渠道：${a.channel.name}（ID ${a.channel.id}）\n结论：${a.verdict}｜综合评分 ${a.score}/100\n请求量：${a.requests}\n成功率：${pct(a.success)}\n错误率：${pct(a.errors/Math.max(a.requests,1))}\n平均响应：${fmt(a.avgTime)}ms（P95 ${fmt(a.p95)}ms）\n额度消耗：${fmt(a.quota)} quota，均次 ${fmt(a.perRequest,1)}\n模型覆盖：${Object.keys(a.modelMap).join('、')}\n异常请求：${a.anomaly.length} 条\n建议：${a.verdict === '建议续费' ? '继续复充，保持异常监控。' : a.verdict === '谨慎续费' ? '小额续费，观察成功率和 P95。' : a.verdict === '暂不续费' ? '暂停新增投入，完成修复后复评。' : '迁移流量并寻找替代渠道。'}`; }

$('#loadData').addEventListener('click', async ()=>{ try { $('#loadData').disabled=true; $('#loadData').textContent='拉取中…'; await loadRealData(); } catch(e) { toast(`拉取失败：${e.message || '请检查地址和认证'}`); } finally { $('#loadData').disabled=false; $('#loadData').innerHTML='<span>↻</span> 拉取数据'; } });
$('#demoData').addEventListener('click', ()=>{ state.days=Number($('#days').value); const d=demoData(); setData(d,true); toast('已切换为演示数据'); });
$('#channelSearch').addEventListener('input', renderChannels);
$('#days').addEventListener('change', ()=>{ state.days=Number($('#days').value); renderAll(); });
$('#reportDate').addEventListener('change', ()=>renderReport(selectedAnalysis()));
$('#copyReport').addEventListener('click', async ()=>{ await navigator.clipboard.writeText(reportText()); toast('日报已复制'); });
$('#downloadReport').addEventListener('click', ()=>{ const blob=new Blob([reportText()],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`channel-report-${$('#reportDate').value||'daily'}.txt`; a.click(); URL.revokeObjectURL(a.href); toast('日报已下载'); });
$('#dailyToggle').addEventListener('change', async e=>{ localStorage.setItem('dailyReminder', e.target.checked ? '1':'0'); if(e.target.checked && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); toast(e.target.checked ? '日报提醒已启用（本机浏览器）' : '日报提醒已关闭'); });
$('#themeToggle').addEventListener('click', ()=>{ document.body.classList.toggle('dark'); localStorage.setItem('theme', document.body.classList.contains('dark')?'dark':'light'); });
if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark'); if(localStorage.getItem('dailyReminder')==='1') $('#dailyToggle').checked=true;
function checkDailyReminder() {
  if (localStorage.getItem('dailyReminder') !== '1' || new Date().getHours() < 12) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (localStorage.getItem('lastDailyReminder') === yesterday) return;
  localStorage.setItem('lastDailyReminder', yesterday);
  const msg = `${yesterday} 渠道日报已就绪：${selectedAnalysis()?.verdict || '请查看分析结果'}`;
  toast(msg);
  if ('Notification' in window && Notification.permission === 'granted') new Notification('渠道续费价值分析', { body: msg });
}
setData(demoData(), true); checkDailyReminder();
