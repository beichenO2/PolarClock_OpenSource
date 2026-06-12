# 登录逻辑检查记录

## 第 1 遍检查 ✓

**检查内容**: userStore.ts init() 函数
**结论**: init() 是同步函数，直接从 localStorage 读取，无网络延迟

## 第 2 遍检查 ✓

**检查内容**: userStore.ts login() 函数
**结论**: 正确存储 token 和 user 到 localStorage

## 第 3 遍检查 ✓

**检查内容**: userStore.ts getToken() 函数
**结论**: 每次调用都从 localStorage 读取最新值

## 第 4 遍检查 ✓

**检查内容**: taskStore.ts 任务 API 调用
**结论**: 所有 fetch 调用都通过 getHeaders 传递 X-Token

## 第 5 遍检查 ✓

**检查内容**: App.tsx 路由逻辑
**结论**: 正确根据 user 状态重定向

## 第 6 遍检查 ✓

**检查内容**: App.tsx useEffect 依赖
**结论**: useEffect 依赖 []，只在挂载时执行一次

## 第 7 遍检查 ✓

**检查内容**: Login.tsx 登录后跳转
**结论**: 登录成功后 navigate('/clock/home')

## 第 8 遍检查 ✓

**检查内容**: 后端 sessions.json 文件
**结论**: 文件存在，格式正确，有有效的 token 映射

## 第 9 遍检查 ✓

**检查内容**: 后端 sessions 持久化逻辑
**结论**: save_sessions 正确调用 json.dump

## 第 10 遍检查 ✓

**检查内容**: 整体流程走查

**完整流程**:

1. 用户访问 /clock/login
2. App.tsx 加载，useEffect 调用 init()
3. init() 同步读取 localStorage
4. 如果有 user 和 token，显示主界面
5. 如果没有，重定向到 /clock/login
6. 用户输入用户名登录
7. login() 调用后端 API
8. 后端返回 user + token
9. 前端存储到 localStorage
10. navigate 到 /clock/home

---

## 所有 10 遍检查已完成，均通过

**可能的问题**:

1. 如果用户之前没有登录过，localStorage 中没有数据，会正确跳转到登录页
2. 如果用户之前登录过，但后端重启了，sessions.json 应该还在
3. 如果清除了浏览器缓存，localStorage 丢失，会要求重新登录