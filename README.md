# CORBA.ts

A TypeScript implementation of CORBA 3.4 for Deno, following the OMG CORBA specification.

## Features

- TypeScript-first API
- Designed for Deno
- Full CORBA 3.4 specification implementation
- Object Request Broker (ORB)
- Interface Definition Language (IDL) mapping
- Portable Object Adapter (POA)
- Dynamic Invocation Interface (DII)
- TypeCode system
- Value Types
- GIOP/IIOP protocol support
- Naming Service

## Installation

```typescript
// Import from JSR
import * as CORBA from "jsr:@eai/corba";

// Or import from Deno.land
import * as CORBA from "https://deno.land/x/corba_ts/mod.ts";
```

## Basic Usage

```typescript
import { CORBA, getRootPOA, init, ORB_instance } from "jsr:@eai/corba";
import { Servant } from "jsr:@eai/corba/poa";

// Initialize CORBA runtime
await init();

// Get the ORB
const orb = ORB_instance();

// Get the Root POA
const rootPOA = getRootPOA();
const poaManager = rootPOA.the_POAManager();

// Activate the POA Manager
await poaManager.activate();

// Define a servant
class HelloServant extends Servant {
  _repository_id(): string {
    return "IDL:Hello:1.0";
  }

  sayHello(name: string): string {
    return `Hello, ${name}!`;
  }
}

// Create a servant
const servant = new HelloServant();

// Activate the servant
const oid = await rootPOA.activate_object(servant);

// Get the object reference
const helloRef = await rootPOA.id_to_reference(oid);

// Convert to string representation
const helloIOR = await orb.object_to_string(helloRef);
console.log("IOR:", helloIOR);

// Run the ORB
await orb.run();
```

## Creating a Client

```typescript
import { CORBA, init, ORB_instance } from "https://deno.land/x/corba_ts/mod.ts";

// Initialize CORBA runtime
await init();

// Get the ORB
const orb = ORB_instance();

// Convert IOR string to object reference
const helloRef = await orb.string_to_object("IOR:...");

// Cast to expected interface
interface Hello {
  sayHello(name: string): Promise<string>;
}

const hello = helloRef as unknown as Hello;

// Invoke method
const result = await hello.sayHello("World");
console.log(result); // "Hello, World!"
```

## Using the Naming Service

```typescript
import { init, ORB_instance, CORBA } from "https://deno.land/x/corba_ts/mod.ts";
import { NamingContext, NamingContextExt } from "https://deno.land/x/corba_ts/src/naming.ts";

// Initialize CORBA runtime
await init();

// Get the ORB
const orb = ORB_instance();

// Resolve the Naming Service
const namingRef = await orb.resolve_initial_references("NameService");
const namingContext = namingRef as unknown as NamingContextExt;

// Bind an object to the Naming Service
const objectRef = /* ... your object reference ... */;
await namingContext.bind_context([{ id: "MyObject", kind: "Object" }], objectRef);

// Resolve an object from the Naming Service
const resolvedRef = await namingContext.resolve_str("MyObject.Object");
```

## IDL to TypeScript Mapping

CORBA.ts includes an IDL parser and TypeScript code generator. Here's how to use it:

```typescript
import { IDL } from "https://deno.land/x/corba_ts/mod.ts";

// Parse IDL and generate TypeScript
const parser = new IDL.SimpleParser();
const idlText = `
  module Example {
    interface Hello {
      string sayHello(in string name);
    };
  };
`;

const modules = parser.parse(idlText);
const tsCode = parser.generate_typescript(modules);
console.log(tsCode);
```

## Components

### ORB (Object Request Broker)

The central component that enables communication between objects across a network. It handles request routing, parameter marshalling/unmarshalling, and object references.

```typescript
import { init, ORB_instance } from "https://deno.land/x/corba_ts/mod.ts";

await init();
const orb = ORB_instance();
```

### POA (Portable Object Adapter)

Manages the lifecycle of object implementations (servants) and maps object references to the corresponding servants.

```typescript
import { getRootPOA } from "https://deno.land/x/corba_ts/mod.ts";

const rootPOA = getRootPOA();
const poaManager = rootPOA.the_POAManager();
await poaManager.activate();
```

### Naming Service

Provides a directory service for CORBA objects.

```typescript
import { ORB_instance } from "https://deno.land/x/corba_ts/mod.ts";
import { NamingContextExt } from "https://deno.land/x/corba_ts/src/naming.ts";

const orb = ORB_instance();
const namingRef = await orb.resolve_initial_references("NameService");
const namingContext = namingRef as unknown as NamingContextExt;
```

### DII (Dynamic Invocation Interface)

Enables dynamic construction and invocation of requests.

```typescript
import { create_request } from "https://deno.land/x/corba_ts/src/dii.ts";

const request = create_request(objectRef, "operationName");
request.add_in_arg("paramValue", typeCode);
request.invoke();
const result = request.return_value();
```

### TypeCode

Describes the type of a CORBA object.

```typescript
import { TypeCode } from "https://deno.land/x/corba_ts/src/typecode.ts";

const stringTC = new TypeCode(TypeCode.Kind.tk_string);
const structTC = TypeCode.create_struct_tc(
  "IDL:MyStruct:1.0",
  "MyStruct",
  [
    { name: "field1", type: new TypeCode(TypeCode.Kind.tk_string) },
    { name: "field2", type: new TypeCode(TypeCode.Kind.tk_long) },
  ],
);
```

## Advanced Examples

### Creating a Custom POA

```typescript
import { getRootPOA, Policy, PolicyType } from "https://deno.land/x/corba_ts/mod.ts";

const rootPOA = getRootPOA();

// Create POA policies
const policy1 = new Policy(PolicyType.LIFESPAN_POLICY_TYPE, "value");
const policy2 = new Policy(PolicyType.ID_UNIQUENESS_POLICY_TYPE, "value");

// Create a child POA with specific policies
const childPOA = await rootPOA.create_POA("MyPOA", null, [policy1, policy2]);
```

### Using Value Types

```typescript
import { ValueBase, ValueFactory } from "https://deno.land/x/corba_ts/src/valuetype.ts";

// Define a value type
class MyValue extends ValueBase {
  constructor(public data: string) {
    super();
  }

  _type_id(): string {
    return "IDL:MyValue:1.0";
  }

  _copy_value(): ValueBase {
    return new MyValue(this.data);
  }
}

// Define a value factory
class MyValueFactory implements ValueFactory {
  create_for_unmarshal(): ValueBase {
    return new MyValue("");
  }
}

// Register the factory
const orb = ORB_instance();
orb.register_value_factory("IDL:MyValue:1.0", new MyValueFactory());
```

## License

MIT
