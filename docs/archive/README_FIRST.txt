BTCUSDT Quant Research Kit — ChatGPT → VS Code → GitHub Actions Bootstrap
========================================================================

目标
----
一次安装后，后续 ChatGPT 可以给你生成一个 *.btcquantjob 任务包。
你打开该任务包后：

1. VS Code 打开 BTCUSDT_Quant_Research_Kit
2. 在 VS Code 集成终端执行任务
3. 任务成功才执行 git add / git commit / git push
4. push 成功后，GitHub 上配置为 push 触发的 Actions 自动启动
5. 任一步失败则不继续自动 commit/push

当前项目路径
------------
C:\Users\18871\Desktop\BTCUSDT_Quant_Research_Kit

第一次安装
----------
1. 解压本 ZIP。
2. 在 VS Code 打开解压目录。
3. 在 VS Code 集成终端运行：

   powershell -ExecutionPolicy Bypass -File .\INSTALL_BTCQUANT_LAUNCHER.ps1

4. 安装成功后，双击 TEST_LAUNCHER.btcquantjob。
5. VS Code 应弹出/复用窗口，并在集成终端看到 SELF_TEST_OK。

以后怎么用
----------
以后 ChatGPT 生成的任务文件会使用：

    *.btcquantjob

这个文件本质上是一个受约束的 ZIP 任务包，包含：
- job.json
- payload\...（需要覆盖/新增到项目中的文件）
- 项目内 entry_script

Runner 会：
- 检查 Git 工作区是否干净（默认脏工作区直接停止）
- 只允许 payload 写入项目根目录以内
- 运行指定 PowerShell/Python 入口
- 入口成功后才允许自动 commit/push
- 失败时写日志并停止，不 push

日志
----
项目内：
research_logs\chatgpt_jobs\

GitHub Actions
--------------
本地 runner 不会“伪造” GitHub Action。
它只负责成功后 git push。

你的仓库只要已有例如：

on:
  push:
    branches:
      - main
      - research

对应 branch 的 workflow，就会被正常触发。

重要安全说明
------------
*.btcquantjob 最终可以执行项目内 PowerShell/Python 代码。
所以只打开你明确信任来源生成的任务包，不要运行陌生来源的 .btcquantjob。

如果仓库已有未提交修改，默认会停止。这是为了避免自动提交把你手工改动混进去。

卸载
----
powershell -ExecutionPolicy Bypass -File .\UNINSTALL_BTCQUANT_LAUNCHER.ps1
