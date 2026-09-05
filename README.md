# 渠道续费价值分析

基于 NewAPI `/api/channel/` 和 `/api/log/` 数据的渠道续费决策工具。

## 本地运行

```powershell
npx http-server -p 4173 -c-1
```

打开 `http://127.0.0.1:4173`。

## 线上部署

生产域名部署在 Caddy 后，通过 `/proxy` 将 NewAPI 请求转发到服务端，避免浏览器跨域 Cookie 限制。评分包含成功率、错误率、响应时间、额度消耗、模型覆盖和请求趋势。
