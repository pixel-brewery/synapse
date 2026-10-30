# Interface: IAdmissionSnapshot

Current local scheduling state for a host scope and route.

## Properties

### active

> `readonly` **active**: `number`

Number of executing operations.

***

### maximum

> `readonly` **maximum**: `number`

Configured maximum simultaneous operations.

***

### queued

> `readonly` **queued**: `number`

Number of cancellable waiting operations.
