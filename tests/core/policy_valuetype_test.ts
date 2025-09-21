/**
 * Policy and ValueType implementation tests
 */

import { assert, assertEquals } from "@std/assert";
import { Policy } from "../../src/policy.ts";
import { BoxedValueBase } from "../../src/valuetype.ts";

Deno.test("Policy: Deep equality comparison works", () => {
  const policy1 = new Policy(1, {
    timeout: 5000,
    retries: 3,
    nested: {
      option: "value",
      array: [1, 2, 3],
    },
  });

  const policy2 = new Policy(1, {
    timeout: 5000,
    retries: 3,
    nested: {
      option: "value",
      array: [1, 2, 3],
    },
  });

  const policy3 = new Policy(1, {
    timeout: 5000,
    retries: 3,
    nested: {
      option: "different",
      array: [1, 2, 3],
    },
  });

  // Same values should be equal
  assertEquals(policy1.equals(policy2), true);

  // Different nested values should not be equal
  assertEquals(policy1.equals(policy3), false);
});

Deno.test("Policy: Handles null and undefined in comparison", () => {
  const policy1 = new Policy(1, null);
  const policy2 = new Policy(1, null);
  const policy3 = new Policy(1, undefined);
  const policy4 = new Policy(1, { value: null });

  assertEquals(policy1.equals(policy2), true);
  assertEquals(policy1.equals(policy3), false);
  assertEquals(policy1.equals(policy4), false);
});

Deno.test("Policy: Different types are not equal", () => {
  const policy1 = new Policy(1, { value: 123 });
  const policy2 = new Policy(2, { value: 123 });

  assertEquals(policy1.equals(policy2), false);
});

Deno.test("Policy: Array comparison works correctly", () => {
  const policy1 = new Policy(1, { items: [1, 2, 3] });
  const policy2 = new Policy(1, { items: [1, 2, 3] });
  const policy3 = new Policy(1, { items: [1, 2, 3, 4] });
  const policy4 = new Policy(1, { items: [1, 3, 2] });

  assertEquals(policy1.equals(policy2), true);
  assertEquals(policy1.equals(policy3), false); // Different length
  assertEquals(policy1.equals(policy4), false); // Different order
});

Deno.test("ValueType: Deep copy creates independent copy", () => {
  type ValueType = {
    name: string;
    count: number;
    nested: {
      flag: boolean;
      items: number[];
    };
  };

  const original = new BoxedValueBase("IDL:Test/Value:1.0", {
    name: "test",
    count: 42,
    nested: {
      flag: true,
      items: [1, 2, 3],
    },
  });

  const copy = original._copy_value() as BoxedValueBase<ValueType>;

  // Should be different instances
  assert(original !== copy, "Copy should be a different instance");

  // But have same values
  assertEquals(original._type_id(), copy._type_id());

  // Modifying copy should not affect original
  const copyValue = (copy as unknown as { _value: ValueType })._value;
  copyValue.nested.flag = false;
  copyValue.nested.items.push(4);

  const originalValue = (original as unknown as { _value: ValueType })._value;
  assertEquals(originalValue.nested.flag, true);
  assertEquals(originalValue.nested.items.length, 3);
});

Deno.test("ValueType: Handles Date objects in deep copy", () => {
  type DateValue = {
    created: Date;
    expires: Date;
  };

  const date = new Date(2024, 0, 1);
  const original = new BoxedValueBase("IDL:Test/DateValue:1.0", {
    created: date,
    expires: new Date(2025, 0, 1),
  });

  const copy = original._copy_value() as BoxedValueBase<DateValue>;
  const copyValue = (copy as unknown as { _value: DateValue })._value;
  const originalValue = (original as unknown as { _value: DateValue })._value;

  // Dates should be different instances
  assert(copyValue.created !== originalValue.created, "Date copies should be different instances");

  // But have same time
  assertEquals(copyValue.created.getTime(), originalValue.created.getTime());

  // Modifying copy date should not affect original
  copyValue.created.setFullYear(2030);
  assertEquals(originalValue.created.getFullYear(), 2024);
});

Deno.test("ValueType: Handles arrays in deep copy", () => {
  type ArrayValue = {
    matrix: number[][];
  };

  const original = new BoxedValueBase("IDL:Test/ArrayValue:1.0", {
    matrix: [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ],
  });

  const copy = original._copy_value() as BoxedValueBase<ArrayValue>;
  const copyValue = (copy as unknown as { _value: ArrayValue })._value;
  const originalValue = (original as unknown as { _value: ArrayValue })._value;

  // Modify nested array in copy
  copyValue.matrix[1][1] = 99;

  // Original should be unchanged
  assertEquals(originalValue.matrix[1][1], 5);
});

Deno.test("ValueType: Handles primitives in deep copy", () => {
  const original = new BoxedValueBase("IDL:Test/Primitive:1.0", 42);
  const copy = original._copy_value() as BoxedValueBase<number>;

  assertEquals((original as unknown as { _value: number })._value, (copy as unknown as { _value: number })._value);

  // Test with string
  const strOriginal = new BoxedValueBase("IDL:Test/String:1.0", "hello");
  const strCopy = strOriginal._copy_value() as BoxedValueBase<string>;
  assertEquals(
    (strOriginal as unknown as { _value: string })._value,
    (strCopy as unknown as { _value: string })._value,
  );
});

Deno.test("ValueType: Handles null and undefined in deep copy", () => {
  const nullValue = new BoxedValueBase("IDL:Test/Null:1.0", null);
  const nullCopy = nullValue._copy_value() as BoxedValueBase<null>;
  assertEquals((nullCopy as unknown as { _value: null })._value, null);

  const undefinedValue = new BoxedValueBase("IDL:Test/Undefined:1.0", undefined);
  const undefinedCopy = undefinedValue._copy_value() as BoxedValueBase<undefined>;
  assertEquals((undefinedCopy as unknown as { _value: undefined })._value, undefined);
});
