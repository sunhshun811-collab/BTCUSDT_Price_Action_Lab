# BTCQuant Launcher

Canonical Git-tracked source for ChatGPT → VS Code `.btcquantjob` execution.

- `runner/`: PowerShell job runner and launch bridge.
- `dist/`: VS Code extension package.
- `examples/`: self-test job.
- `INSTALL.ps1`: install/repoint local Windows/VS Code integration.
- `UNINSTALL.ps1`: remove local integration without deleting repository source.

Only machine-local registration/configuration under `%USERPROFILE%\.btcquant-launcher` is outside Git.
