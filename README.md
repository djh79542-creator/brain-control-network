# NEURAL LINK · 大脑神经回路可视化

把 17 种主观状态（刷屏、戒断、心流、失恋、睡眠剥夺…）拆成 **6 个有时间轴的阶段**，每个阶段给机制、给主观体感、给带证据等级的处置，画成一颗可以转、可以点、可以缩放的 3D 全息回路。

**它是什么**：fMRI / 电生理结论的**示意化表达**，用于科普讲解与心理教育。
**它不是什么**：不是解剖精度图，不是诊断工具，不宣称任何干预效果。核团坐标与投射按讲解需要简化过。

零依赖、零构建：四个 `.js` + 一个 `.css`，Canvas 2D 手写的投影，不用 three.js。

---

## 跑起来

```bash
node server.js 5200          # 监听 0.0.0.0，同网段手机可直接开 http://<本机IP>:5200/
```

或者用任意静态托管，也可以直接双击 `index.html`（`file://` 下深链改 URL 会自动降级，不报错）。

`server.js` 除了发静态文件，还收 `/_probe` 的设备自检上报（UA、视口、画布尺寸、实测帧率、脚本报错），打在控制台成 `[PROBE]` 行。**用户报"某台设备上表现不对"时，先让他打开一次再读这条日志**，比远程猜渲染代码快得多。注意：纯静态托管上没有这个后端，自检请求会静默落到 404/兜底页。

## URL 参数

| 参数 | 取值 | 用途 |
| --- | --- | --- |
| `sc` | 17 个场景 key 之一 | 深链到指定场景；页面内切换场景时也会同步回地址栏 |
| `stage` | `1`–`6` | 定格某一阶段，自动暂停推进 |
| `z` | `0.5`–`2.4` | 取景缩放（默认 1）。出竖版/方形封面时必带，否则回路只占画面一小条 |
| `press` | `1` | 单场景可分享页：隐掉场景切换入口与跳转下拉、展开干预卡、页脚追加免责与出处、去掉构建号、**关闭设备自检上报** |
| `press` | `2` | 出图模式：只留画面，烧进左上「场景号 · 阶段名 · 时间窗」与左下「系列名 · 示意模型，非诊疗建议」 |

场景 key：`dependence withdrawal craving doomscroll flow habit procrastinate fatigue compulsion heartbreak rejection attachment revenge stress panic flashback sleepless`

发给编辑的形态是 `/?sc=sleepless&press=1`。

## 目录

```
index.html          DOM 骨架；脚本顺序 data.js → fixes.js → app.js → press.js
assets/data.js      SCENARIOS 17 场景 + REGIONS 25 核团 + EDGES 51 通路
assets/fixes.js     FIXES 每场景 4 条干预 + FIX_LEGEND 证据等级图例（独立文件，不改 SCENARIOS）
assets/app.js       投影与渲染、交互、阶段推进、设备自检上报
assets/press.js     外发模式（press=1 / press=2），只读 DOM，不参与渲染循环
assets/style.css
server.js           局域网静态服务 + /_probe 收集
press/              对外物料，见下节
```

## 数据格式

```js
SCENARIOS[key] = { tag, title, sub, group, accent, accent2, thesis, mainPath, chem,
                   nodes: { 核团id: 参与度 }, edges: { "a|b": 权重 },
                   stages: [ { name, time, len, intensity, focus[], flows[[a,b]], chem, mech, exp } × 6 ] }
```

`group` 就是分类轴：奖赏与动机 5 / 习惯与控制 4 / 社会与联结 4 / 应激与唤醒 4。
`len` 是该阶段的秒数，`chem` 四个键固定为 `DA / 5HT / OT / COR`。

### 三条不变量（破坏了**不报错**，只是画面看不见）

1. stage 的每个 `flows` 对必须在 `EDGES` 里声明过；
2. 还必须在**该场景自己的** `edges` 里有显式权重；
3. `focus` / `nodes` / 干预靶点里的 id 必须在 `REGIONS` 的 25 个 id 内。

第 1、2 条破掉时，该阶段没有流动粒子或几乎看不见——静默失效，肉眼容易误判成"渲染 bug"。加场景或改文案后跑一遍：

```bash
node -e '
const fs=require("fs"),vm=require("vm");const ctx={};vm.createContext(ctx);
for(const f of ["assets/data.js","assets/fixes.js"])vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f});
const {REGIONS,EDGES,SCENARIOS,FIXES}=vm.runInContext("({REGIONS,EDGES,SCENARIOS,FIXES})",ctx);
const has=(o,a,b)=>Object.prototype.hasOwnProperty.call(o,a+"|"+b)||Object.prototype.hasOwnProperty.call(o,b+"|"+a);
const declared=new Set(EDGES.map(e=>[e[0],e[1]].sort().join("|")));
const ids=new Set(REGIONS.map(r=>r.id));let err=[];
for(const k in SCENARIOS){const sc=SCENARIOS[k];
  sc.stages.forEach((s,i)=>{
    if(typeof s.len!=="number")err.push(`${k} stage${i+1}: 缺 len`);
    (s.focus||[]).forEach(n=>{if(!ids.has(n))err.push(`${k} stage${i+1}: focus 未知核团 ${n}`);});
    (s.flows||[]).forEach(f=>{const p=[f[0],f[1]].sort().join("|");
      if(!declared.has(p))err.push(`${k} stage${i+1}: flow ${p} 不在 EDGES`);
      if(!has(sc.edges,f[0],f[1]))err.push(`${k} stage${i+1}: flow ${p} 缺本场景显式权重`);});
  });
  Object.keys(sc.nodes).forEach(n=>{if(!ids.has(n))err.push(`${k}: nodes 引用未知核团 ${n}`);});
  const fx=FIXES[k];
  if(!fx)err.push(`${k}: 无干预卡`);
  else fx.items.forEach((it,j)=>{
    if(!ids.has(it.node))err.push(`${k} 干预${j+1}: 靶点 ${it.node} 不在 REGIONS`);
    if(!"ABC".includes(it.lv))err.push(`${k} 干预${j+1}: 等级 ${it.lv} 非法`);});
}
console.log(err.length?err.join("\n"):`OK  ${ids.size} 核团 / ${declared.size} 通路 / ${Object.keys(SCENARIOS).length} 场景 × 6 阶段 / ${Object.values(FIXES).reduce((a,f)=>a+f.items.length,0)} 条干预 全部自洽`);
'
```

## 干预与解法

每个场景 4 条，共 68 条，当前分布 A25 / B27 / C16。`lv` 是证据等级，不是重要度：

- **A** 随机对照证据较充分
- **B** 外推自相邻领域
- **C** 机制推演，缺直接证据

右栏卡片**默认折叠成一行**，点标题展开/收起（与上方阶段卡同一套交互）；点条目只打开该核团的档案，**不动 3D 镜头**。

## press/ —— 对外物料

和上面的 web 是**单向依赖**：图是从 `press=2` 截的，文案是照 `data.js` + `fixes.js` 抄的。页面改了这些会过期，反过来不会。

| 文件 | 是什么 |
| --- | --- |
| `images/head-900x500.png` `poster-1080x1920.png` `square-1080x1080.png` | 三种尺寸的封面，重生成配方见 `pitch.md` 第五节 |
| `images/frame-01…06.png` | 六个阶段的定格帧，可当条漫分格 |
| `copy-sc17.md` | SC-17 约 700 字机制正文 + 参考文献占位表 |
| `storyboard-sc17.md` | 45–75 秒竖屏分镜与旁白 |
| `pitch.md` | 报价与授权 |
| `targets.md` | 30 家外发对象清单 |

> ⚠️ **`press/` 下四份 md 目前都是草稿，不能外发**：报价区间来自厂商宣传页未校准、文献全部【待填】、联系方式与审校署名为空。`targets.md` 含编辑邮箱与逐家判断、`pitch.md` 含未公开报价——**这两份不该出现在公网部署目录里**。

## 已知限制

- 公网部署（Cloudflare Pages）是整仓推上去的，`press/*.md` 与 `server.js` 当前**公网可读**；`/_probe` 在线上返回兜底页，所以设备自检只在 `node server.js` 下有效。
- Gitee Pages 走不通：仓库私有，`dijiahui.gitee.io` 404，且不随 push 自动更新。
- 移动端"没有动画"那次反馈至今没有回执（构建号核对到 b15 为止）。

## 分支与远端

`main` 与 `develop` 同步推进。远端两个：GitHub 私有（HTTPS）+ Gitee（SSH，公钥单独配置）。改完当场提交并两边都推。
