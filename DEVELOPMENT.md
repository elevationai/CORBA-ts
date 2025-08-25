# CORBA.ts Development Guide

This document provides an overview of the CORBA.ts library, its structure, and development guidelines.

## Project Structure

- `mod.ts` - Main entry point for the library
- `src/` - Source code
  - `index.ts` - Main exports
  - `types.ts` - Core CORBA types
  - `orb.ts` - Object Request Broker implementation
  - `object.ts` - Object reference implementation
  - `typecode.ts` - TypeCode system
  - `policy.ts` - Policy implementation
  - `context.ts` - Context implementation
  - `valuetype.ts` - Value type implementation
  - `poa.ts` - Portable Object Adapter implementation
  - `giop.ts` - GIOP/IIOP protocol implementation
  - `idl.ts` - IDL to TypeScript mapping
  - `dii.ts` - Dynamic Invocation Interface
  - `naming.ts` - Naming Service implementation
- `examples/` - Example applications
  - `hello_world/` - Basic Hello World example
  - `idl/` - IDL to TypeScript example
  - `naming_service/` - Naming Service example
- `tests/` - Test files

## Implementation Notes

### Current Status

The current implementation provides:

1. A complete type system for CORBA
2. An ORB implementation
3. POA (Portable Object Adapter) implementation
4. Object reference handling
5. TypeCode system
6. Value Type support
7. GIOP/IIOP protocol skeleton
8. Dynamic Invocation Interface (DII)
9. Naming Service implementation
10. IDL to TypeScript mapping (partial)

### Known Limitations

1. Network communication is not fully implemented - the current version focuses on the type system and API
2. The GIOP implementation is a skeleton that needs completion
3. IDL parser is a placeholder and requires complete implementation
4. Some TypeScript type errors need to be fixed

## Development Guidelines

### Adding New Features

1. Make sure to follow the CORBA 3.4 specification
2. Implement interfaces first, then implementations
3. Add tests for new features
4. Document new features in README.md

### Type System

The CORBA type system is defined in `src/types.ts` and should be used consistently throughout the library.

### Testing

Run tests using Deno's test framework:

```bash
deno test --allow-all tests/
```

### Contributing

To contribute to CORBA.ts:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for your changes
5. Submit a pull request

## Future Work

1. Complete the GIOP/IIOP implementation for network communication
2. Implement a full IDL parser and code generator
3. Add more CORBA services (Event Service, Transaction Service, etc.)
4. Fix TypeScript type issues
5. Add more examples and documentation

## References

- [OMG CORBA 3.4 Specification](https://www.omg.org/spec/CORBA/3.4/About-CORBA)
- [Deno Documentation](https://deno.land/manual)
