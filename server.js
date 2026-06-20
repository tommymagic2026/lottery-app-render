const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

// 1. 托管当前目录下的静态网页（替代你原本的 npx serve）
app.use(express.static(__dirname));

// 2. 设立代理中转站：把所有发往 /tanshu-api 的请求，悄悄在后台转发给探数数据
app.use('/tanshu-api', createProxyMiddleware({
    target: 'https://api2.tanshuapi.com',
    changeOrigin: true,
    pathRewrite: {
        '^/tanshu-api': '' // 转发时去掉 /tanshu-api 前缀
    }
}));

// 3. 让这个代理服务器运行起来（本地测试用 3000 端口；部署到 Render 等平台时用平台分配的端口）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 代理服务器已启动！请访问: http://localhost:${PORT}/lo_date.html`);
});