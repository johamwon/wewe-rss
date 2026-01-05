# 账号检测服务

## 功能说明

账号检测服务用于定时检测微信读书账号是否失效，一旦检测到账号失效，会自动：
1. 将账号状态更新为失效
2. 生成新的登录二维码
3. 通过webhook发送通知（包含账号信息和二维码）

## 配置说明

### 定时任务

- 账号检测定时任务已配置为每4小时执行一次（Cron表达式：`0 */4 * * *`）
- 定时任务配置在代码中，无需通过环境变量设置

### Webhook通知

- Webhook URL已配置为钉钉机器人地址
- 当账号失效时会自动发送markdown格式的通知消息
- 如果markdown格式发送失败，会自动降级为文本消息

### Webhook 请求格式

当账号失效时，会向配置的webhook URL发送POST请求，请求体格式如下：

```json
{
  "message": "微信读书账号失效通知",
  "account": {
    "id": "账号ID",
    "name": "账号名称"
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "qrCode": {
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "scanUrl": "https://weread.111965.xyz/..."
  }
}
```

## 使用方法

### 自动检测

服务启动后，会根据配置的Cron表达式自动执行账号检测。

### 手动触发检测

可以通过调用 `AccountCheckService.manualCheck()` 方法手动触发检测：

```typescript
// 检测所有账号
await accountCheckService.manualCheck();

// 检测指定账号
await accountCheckService.manualCheck('account_id');
```

## 检测逻辑

1. 获取所有状态为"启用"的账号
2. 对每个账号调用API验证token是否有效
3. 如果返回401错误，判定为账号失效
4. 失效后自动生成新的登录二维码并发送通知

## 注意事项

- 检测间隔：每个账号检测间隔5秒，避免请求过于频繁
- 误判处理：只有明确的401错误才会判定为失效，其他错误（如404、网络错误等）不会判定为失效
- Webhook超时：Webhook请求超时时间为10秒

