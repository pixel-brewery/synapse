# Interface: INodeProcessRunnerOptions

Native process ownership budgets, independent of a particular CLI.

## Properties

### maximumProcesses?

> `readonly` `optional` **maximumProcesses?**: `number`

Maximum concurrent owned subprocesses, default 32.

***

### terminationGraceMs?

> `readonly` `optional` **terminationGraceMs?**: `number`

Unix graceful termination window before SIGKILL, default 500 milliseconds.
