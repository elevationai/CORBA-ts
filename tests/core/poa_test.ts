/**
 * POA (Portable Object Adapter) Tests
 * Testing proper IOR creation and object ID extraction
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { POA, RootPOA, type Servant } from "../../src/poa.ts";
import { IORUtil } from "../../src/giop/ior.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";
import { CORBA } from "../../src/types.ts";
import type { IOR } from "../../src/giop/types.ts";
import type { Object } from "../../src/object.ts";

// Mock Servant for testing
class TestServant implements Servant {
  _repository_id(): string {
    return "IDL:Test/Service:1.0";
  }

  _default_POA(): POA {
    return new RootPOA("TestPOA");
  }

  _is_a(repositoryId: string): boolean {
    return repositoryId === this._repository_id();
  }

  _all_interfaces(): string[] {
    return [this._repository_id()];
  }

  _non_existent(): boolean {
    return false;
  }
}

Deno.test("POA: create_reference_with_id creates proper IOR", () => {
  const poa = new RootPOA("RootPOA");
  const oid = new Uint8Array([1, 2, 3, 4]);
  const intf = "IDL:Test/Service:1.0";

  const objRef = poa.create_reference_with_id(oid, intf);

  // Check that it's a valid object
  assertExists(objRef);

  // Cast to CORBA.ObjectRef to access IOR
  const corbaRef = objRef as unknown as CORBA.ObjectRef;
  assertExists(corbaRef._ior);
  const ior = corbaRef._ior as IOR;
  assertEquals(ior.typeId, intf);

  // Check IOR has IIOP profile
  assertEquals(ior.profiles.length > 0, true);
  const iiopProfile = ior.profiles.find((p: { profileId: number }) => p.profileId === 0);
  assertExists(iiopProfile);

  // Verify object key is in the profile
  const cdr = new CDRInputStream(iiopProfile.profileData);
  cdr.readOctet(); // major version
  cdr.readOctet(); // minor version
  cdr.readString(); // host
  cdr.readUShort(); // port
  const keyLength = cdr.readULong();
  assertEquals(keyLength, 4); // Should match our OID length

  const extractedKey = new Uint8Array(keyLength);
  for (let i = 0; i < keyLength; i++) {
    extractedKey[i] = cdr.readOctet();
  }
  assertEquals(extractedKey, oid);
});

Deno.test("POA: reference_to_id extracts object ID from IOR", async () => {
  const poa = new RootPOA("RootPOA");
  const oid = new Uint8Array([5, 6, 7, 8, 9]);
  const intf = "IDL:Test/Another:1.0";

  // Create reference
  const objRef = poa.create_reference_with_id(oid, intf);

  // Extract ID back
  const extractedOid = await poa.reference_to_id(objRef);

  assertEquals(extractedOid, oid);
});

Deno.test("POA: create_reference generates unique object IDs", () => {
  const poa = new RootPOA("RootPOA");
  const intf = "IDL:Test/Service:1.0";

  const ref1 = poa.create_reference(intf);
  const ref2 = poa.create_reference(intf);

  // Both should be valid references
  assertExists(ref1);
  assertExists(ref2);

  // They should have different IORs
  const ior1 = (ref1 as unknown as CORBA.ObjectRef)._ior as IOR;
  const ior2 = (ref2 as unknown as CORBA.ObjectRef)._ior as IOR;

  const iorStr1 = IORUtil.toString(ior1);
  const iorStr2 = IORUtil.toString(ior2);

  // IOR strings should be different (different object keys)
  assertEquals(iorStr1 !== iorStr2, true);
});

Deno.test("POA: _is_a method works correctly", async () => {
  const poa = new RootPOA("RootPOA");
  const oid = new Uint8Array([10, 11, 12]);
  const intf = "IDL:Test/Specific:1.0";

  const objRef = poa.create_reference_with_id(oid, intf);
  const corbaRef = objRef as unknown as CORBA.ObjectRef;

  // Should return true for matching interface
  assertEquals(await corbaRef._is_a!(intf), true);

  // Should return false for non-matching interface
  assertEquals(await corbaRef._is_a!("IDL:Test/Other:1.0"), false);
});

Deno.test("POA: _hash method produces consistent results", () => {
  const poa = new RootPOA("RootPOA");
  const oid = new Uint8Array([20, 21, 22]);
  const intf = "IDL:Test/Hash:1.0";

  const objRef = poa.create_reference_with_id(oid, intf);
  const corbaRef = objRef as unknown as CORBA.ObjectRef;

  const hash1 = corbaRef._hash!(1000);
  const hash2 = corbaRef._hash!(1000);

  // Hash should be consistent
  assertEquals(hash1, hash2);

  // Hash should be within bounds
  assertEquals(hash1 >= 0 && hash1 < 1000, true);
});

Deno.test("POA: _is_equivalent compares IORs correctly", () => {
  const poa = new RootPOA("RootPOA");
  const oid = new Uint8Array([30, 31, 32]);
  const intf = "IDL:Test/Equiv:1.0";

  const objRef1 = poa.create_reference_with_id(oid, intf);
  const objRef2 = poa.create_reference_with_id(oid, intf);
  const objRef3 = poa.create_reference_with_id(new Uint8Array([40, 41, 42]), intf);

  const corbaRef1 = objRef1 as unknown as CORBA.ObjectRef;
  const corbaRef2 = objRef2 as unknown as CORBA.ObjectRef;
  const corbaRef3 = objRef3 as unknown as CORBA.ObjectRef;

  // Same OID and interface should be equivalent
  assertEquals(corbaRef1._is_equivalent!(corbaRef2), true);

  // Different OID should not be equivalent
  assertEquals(corbaRef1._is_equivalent!(corbaRef3), false);
});

Deno.test("POA: _non_existent checks servant existence", async () => {
  const poa = new RootPOA("RootPOA");
  const servant = new TestServant();

  // Activate a servant
  const oid = await poa.activate_object(servant);

  // Create reference for the activated servant
  const objRef1 = poa.create_reference_with_id(oid, servant._repository_id());
  const corbaRef1 = objRef1 as unknown as CORBA.ObjectRef;

  // Should return false (servant exists)
  assertEquals(await corbaRef1._non_existent!(), false);

  // Create reference for non-existent servant
  const nonExistentOid = new Uint8Array([99, 99, 99]);
  const objRef2 = poa.create_reference_with_id(nonExistentOid, "IDL:Test/NonExistent:1.0");
  const corbaRef2 = objRef2 as unknown as CORBA.ObjectRef;

  // Should return true (servant doesn't exist)
  assertEquals(await corbaRef2._non_existent!(), true);
});

Deno.test("POA: Round-trip object ID through reference", async () => {
  const poa = new RootPOA("RootPOA");

  // Test with various object ID sizes
  const testOids = [
    new Uint8Array([1]),
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([255, 254, 253, 252, 251]),
    new Uint8Array(Array.from({ length: 100 }, (_, i) => i)),
  ];

  for (const originalOid of testOids) {
    const objRef = poa.create_reference_with_id(originalOid, "IDL:Test/RoundTrip:1.0");
    const extractedOid = await poa.reference_to_id(objRef);

    assertEquals(extractedOid, originalOid, `Failed for OID of length ${originalOid.length}`);
  }
});

Deno.test("POA: reference_to_id handles invalid references", async () => {
  const poa = new RootPOA("RootPOA");

  // Object without IOR
  const invalidRef = {} as Object;

  try {
    await poa.reference_to_id(invalidRef);
    throw new Error("Should have thrown BAD_PARAM");
  } catch (error) {
    assertEquals((error as Error).constructor.name, "BAD_PARAM");
    assertEquals((error as Error).message.includes("missing IOR"), true);
  }
});

Deno.test("POA: reference_to_id handles IOR without IIOP profile", async () => {
  const poa = new RootPOA("RootPOA");

  // Create a reference with non-IIOP profile
  const invalidRef = {
    _ior: {
      typeId: "IDL:Test/Invalid:1.0",
      profiles: [
        {
          profileId: 99, // Not TAG_INTERNET_IOP (0)
          profileData: new Uint8Array([1, 2, 3]),
        },
      ],
    },
  } as unknown as Object;

  try {
    await poa.reference_to_id(invalidRef);
    throw new Error("Should have thrown BAD_PARAM");
  } catch (error) {
    assertEquals((error as Error).constructor.name, "BAD_PARAM");
    assertEquals((error as Error).message.includes("No IIOP profile"), true);
  }
});
