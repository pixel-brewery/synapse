# Interface: IProfileManagerOptions

Application-owned storage options for isolated CLI profiles.

## Properties

### maxProfiles?

> `readonly` `optional` **maxProfiles?**: `number`

Maximum remembered profile mappings per manager; defaults to 1024.

***

### rootDirectory

> `readonly` **rootDirectory**: `string`

Absolute private storage root. Construction performs no filesystem access.
