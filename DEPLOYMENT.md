# 部署说明

## 环境要求

- Node.js 20+ 
- pnpm 9+
- 至少 1GB 可用内存

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 http://localhost:5000 (或你在 .env 中配置的端口)

## 生产部署

### 1. 构建项目

```bash
pnpm run build
```

### 2. 部署到服务器

将以下文件/目录复制到服务器：
- `dist/` - 编译后的服务器代码
- `.next/` - Next.js 构建输出
- `package.json`
- `pnpm-lock.yaml`
- `public/` - 静态资源（如果有）

### 3. 服务器上安装依赖

```bash
# 在服务器项目目录下
pnpm install --prod
```

### 4. 配置环境变量

在服务器上创建 `.env` 文件，参考 `.env.example` 配置：

```bash
# 鑫云平台账号
XINYUN_PHONE=your_phone_number
XINYUN_PASSWORD=your_password
XINYUN_TENANT_ID=your_tenant_id

# 端口配置
DEPLOY_RUN_PORT=5000
COZE_PROJECT_ENV=PROD
```

### 5. 启动服务

```bash
# 方式一：直接启动
pnpm start

# 方式二：使用 PM2 (推荐用于生产环境)
# 先安装 PM2: npm install -g pm2
pm2 start dist/server.js --name "ai-live-analysis"
```

## 使用 PM2 管理进程 (推荐)

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start dist/server.js --name "ai-live-analysis"

# 查看状态
pm2 status

# 查看日志
pm2 logs ai-live-analysis

# 重启应用
pm2 restart ai-live-analysis

# 停止应用
pm2 stop ai-live-analysis

# 设置开机自启
pm2 startup
pm2 save
```

## 数据持久化

数据存储在 `data/storage.json` 文件中，确保：
1. 服务器上有该目录的写权限
2. 定期备份 `data/` 目录
3. 可以通过 `DATA_STORAGE_PATH` 环境变量自定义数据存储位置

## 反向代理配置 (Nginx 示例)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 常见问题

### 端口被占用
修改 `.env` 文件中的 `DEPLOY_RUN_PORT` 或使用 `PORT` 环境变量指定其他端口

### 权限问题
确保运行用户有项目目录的读写权限，特别是 `data/` 目录

### 数据备份
定期备份 `data/storage.json` 文件，可以设置定时任务：
```bash
0 2 * * * cp /path/to/project/data/storage.json /path/to/backup/storage-$(date +\%Y\%m\%d).json
```
