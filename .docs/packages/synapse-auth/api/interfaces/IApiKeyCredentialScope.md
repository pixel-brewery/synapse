# Interface: IApiKeyCredentialScope

Detached identity of one backend-owned API-key connection, without a secret or native path.

## Remarks

The host derives these values from an authorized connection. Secret stores must use
the complete tuple for isolation; identifiers supplied by a browser are not authorization.

## Properties

### accountId

> `readonly` **accountId**: `string`

Host-defined account identity within the application.

***

### applicationId

> `readonly` **applicationId**: `string`

Application that owns the connection.

***

### driverId

> `readonly` **driverId**: `string`

Open provider/authentication adapter identity selected by the host.

***

### instanceId

> `readonly` **instanceId**: `string`

Configured connection identity within the host runtime.

***

### profileId

> `readonly` **profileId**: `string`

Profile identity used by the shared credential-change coordinator.
