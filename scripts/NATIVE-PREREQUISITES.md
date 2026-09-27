# Windows 原生桌面验证前检查

在尝试编译 CDesktop 之前运行：

```powershell
node scripts/check-native-toolchain.mjs
```

退出码 `0` 仅表示所需文件与安装元数据存在；`2` 表示前置条件缺失或当前平台不在此检查的覆盖范围。**两者都不是编译、原生测试或用户验收结果。** 此脚本是单独的诊断入口，尚未自动接入所有构建命令。

检查读取项目固定的 `rust-toolchain.toml`，检查对应 Windows x64 Rust 编译器、Cargo、rustfmt、标准库、完整的 Visual Studio C++ 安装，以及同一版本 Windows SDK 的头文件、库和资源编译器。优先使用当前进程的 `RUSTUP_HOME`，没有设置时读取用户目录下的 `.rustup`。

它不会执行 rustup、Cargo、Rust 编译器、安装器或网络请求，不修改环境变量、默认工具链、全局设置和项目依赖。唯一可能启动的进程是已经安装的 `vswhere.exe`，用于只读查询 Visual Studio 元数据。不要用 `rustup toolchain list` 代替该检查来诊断不完整的工具链，因为损坏或待恢复的安装可能触发其他行为。

如果前置条件缺失，先按实际报告补齐官方、固定版本依赖。不要创建占位可执行文件，不要删除锁文件，不要将项目改成最新 Rust 来掩盖安装问题。保留当前安装与源码的回退点；需要下载或修改系统安装时，按当前任务授权范围处理。

后续至少还需验证：工具版本与项目固定版本匹配、Cargo 锁定依赖、原生编译、原生测试、客户端真实后端连接和用户操作闭环。Cargo 依赖是否齐全、工具可执行性及完整性不在此文件存在性检查范围内。Windows x64 检查也不能代替 Linux 或其他架构的构建验证。

诊断逻辑的测试使用明确标记的临时文件样本，**不运行模拟编译器**：

```powershell
node --test scripts/check-native-toolchain.test.mjs
```

官方参考：[Rust 安装配置](https://rust-lang.github.io/rustup/concepts/profiles.html)、[Windows 安装前提](https://rust-lang.github.io/rustup/installation/other.html)。
